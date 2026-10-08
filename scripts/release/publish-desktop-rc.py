"""Verify native artifacts and publish an explicitly unsigned release candidate."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile


def gh(*arguments):
    return subprocess.check_output(['gh', *arguments], text=True)


def digest(file):
    checksum = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def single(files, name):
    matches = [file for file in files if file.name == name]
    if len(matches) != 1:
        raise ValueError(f'Expected one {name}; found {len(matches)}')
    return matches[0]


def find_release(repository, tag):
    releases = json.loads(gh('api', f'repos/{repository}/releases?per_page=100'))
    return next((release for release in releases if release['tag_name'] == tag), None)


def read_uploaded_release(repository, tag):
    # GitHub's /releases/tags endpoint does not expose an unpublished draft.
    release = find_release(repository, tag)
    if release is None:
        raise ValueError('Release draft not found')
    return json.loads(gh('api', f"repos/{repository}/releases/{release['id']}"))


def assemble(source, destination, version):
    destination.mkdir(parents=True, exist_ok=True)
    if list(destination.iterdir()):
        raise ValueError('Release staging directory must be empty')
    connector = None
    manifest_hash = None
    for target in ['win-x64', 'mac-x64', 'mac-arm64', 'linux-x64', 'linux-arm64']:
        files = [file for file in (source / f'seminai-{target}').rglob('*') if file.is_file()]
        manifest = single(files, 'SHA256SUMS.txt').read_text()
        verified_names = set()
        for line in manifest.strip().splitlines():
            match = re.fullmatch(r'([a-f0-9]{64})  ([^/\\]+)', line)
            if not match or digest(single(files, match[2])) != match[1]:
                raise ValueError(f'Checksum mismatch: {target} {line}')
            verified_names.add(match[2])
        pattern = rf'Seminai-{re.escape(version)}-.*\.(exe|dmg|zip|AppImage|deb)'
        installers = [file for file in files if re.fullmatch(pattern, file.name)]
        if len(installers) != (1 if target == 'win-x64' else 2):
            raise ValueError(f'Missing installers for {target}')
        required = {file.name for file in installers} | {
            'SBOM.cdx.json', 'licenses.zip', 'seminai-mcp-1.0.1.mcpb',
        }
        if not required.issubset(verified_names):
            raise ValueError(f'Checksum manifest omits release files for {target}')
        for file in installers:
            shutil.copyfile(file, destination / file.name)
        for old_name, new_name in [
            ('SBOM.cdx.json', f'SBOM-{target}.cdx.json'),
            ('licenses.zip', f'licenses-{target}.zip'),
        ]:
            shutil.copyfile(single(files, old_name), destination / new_name)
        candidate = single(files, 'seminai-mcp-1.0.1.mcpb')
        with zipfile.ZipFile(candidate) as archive:
            current_manifest = hashlib.sha256(archive.read('manifest.json')).hexdigest()
        if manifest_hash and manifest_hash != current_manifest:
            raise ValueError('MCPB manifests differ across native builds')
        manifest_hash = current_manifest
        # esbuild's strict-mode/CommonJS interop output differs between Windows and Unix.
        # All copies retain their verified native-build checksums. Distribute one
        # canonical, platform-neutral Node bundle, independent of artifact iteration order.
        if target == 'linux-x64':
            connector = candidate
        print(f'Verified {target}', flush=True)
    shutil.copyfile(connector, destination / connector.name)
    for name in ['LICENSE', 'NOTICE']:
        shutil.copyfile(name, destination / name)
    (destination / 'LICENSES.txt').write_text(
        'Seminai is AGPL-3.0-or-later; see LICENSE and NOTICE. '
        'Complete third-party licenses, including PostgreSQL, Node, Electron and '
        'the tunnel client, are in licenses-<platform>-<architecture>.zip. '
        'The SBOM inventories installed build/runtime packages for each target.\n'
    )
    checksums = {file.name: digest(file) for file in sorted(destination.iterdir())}
    (destination / 'SHA256SUMS.txt').write_text(
        ''.join(f'{checksum}  {name}\n' for name, checksum in checksums.items())
    )
    return {file.name: digest(file) for file in destination.iterdir()}


def main():
    repository = os.environ['GITHUB_REPOSITORY']
    tag = os.environ.get('SEMINAI_RELEASE_TAG', os.environ['GITHUB_REF_NAME'])
    commit = os.environ.get('SEMINAI_RELEASE_COMMIT', os.environ['GITHUB_SHA'])
    version = json.loads(Path('packages/desktop/package.json').read_text())['version']
    if not re.fullmatch(r'1\.0\.1-rc\.\d+', version) or tag != f'v{version}':
        raise ValueError('Only a matching 1.0.1 release-candidate tag may publish')
    if json.loads(gh('api', f'repos/{repository}/commits/{tag}'))['sha'] != commit:
        raise ValueError('The release commit must be the immutable tag target')
    runs = json.loads(gh('run', 'list', '--repo', repository, '--workflow', 'ci.yml',
                         '--commit', commit, '--limit', '10', '--json', 'conclusion,status'))
    if not any(run['status'] == 'completed' and run['conclusion'] == 'success' for run in runs):
        raise ValueError('A successful full CI run on this commit is required')
    destination = Path('artifacts/verified-release')
    checksums = assemble(Path(sys.argv[1]), destination, version)
    existing = find_release(repository, tag)
    if existing and not existing['draft']:
        raise ValueError('Published releases are not overwritten')
    if not existing:
        gh('release', 'create', tag, '--repo', repository, '--verify-tag', '--draft',
           '--prerelease', '--latest=false', '--title', f'Seminai {version}',
           '--notes-file', 'docs/releases/1.0.1-rc.1.md')
    gh('release', 'upload', tag, '--repo', repository, '--clobber',
       *[str(file) for file in sorted(destination.iterdir())])
    release = read_uploaded_release(repository, tag)
    uploaded = {asset['name']: asset.get('digest') for asset in release['assets']}
    if uploaded != {name: f'sha256:{checksum}' for name, checksum in checksums.items()}:
        raise ValueError('Uploaded assets differ from verified files; release remains draft')
    gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--prerelease', '--latest=false')
    print(f'Published {tag}: {len(checksums)} verified assets')


if __name__ == '__main__':
    main()
