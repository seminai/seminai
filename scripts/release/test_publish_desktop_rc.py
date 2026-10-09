"""Release publication checks run with synthetic artifacts, never a GitHub token."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location(
    'publish_rc', Path(__file__).with_name('publish-desktop-rc.py'),
)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class ReleaseArtifactsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.source = Path(self.temporary.name) / 'native'
        self.destination = Path(self.temporary.name) / 'release'
        for target, extensions in [
            ('win-x64', ['exe']), ('mac-x64', ['dmg', 'zip']),
            ('mac-arm64', ['dmg', 'zip']), ('linux-x64', ['AppImage', 'deb']),
            ('linux-arm64', ['AppImage', 'deb']),
        ]:
            folder = self.source / f'seminai-{target}'
            folder.mkdir(parents=True)
            for extension in extensions:
                (folder / f'Seminai-1.0.1-rc.1-{target}.{extension}').write_bytes(b'synthetic')
            (folder / 'SBOM.cdx.json').write_text('{}')
            (folder / 'licenses.zip').write_bytes(b'synthetic notices')
            with zipfile.ZipFile(folder / 'seminai-mcp-1.0.1.mcpb', 'w') as archive:
                archive.writestr('server/server.cjs', 'synthetic connector')
                archive.writestr('manifest.json', '{}')
            (folder / 'SHA256SUMS.txt').write_text(''.join(
                f'{publisher.digest(file)}  {file.name}\n' for file in folder.iterdir()
            ))

    def test_assembles_all_native_assets_and_independent_checksums(self):
        checksums = publisher.assemble(self.source, self.destination, '1.0.1-rc.1')
        self.assertEqual(len(checksums), 24)
        self.assertEqual(len(list(self.destination.glob('SBOM-*.cdx.json'))), 5)
        self.assertEqual(len(list(self.destination.glob('licenses-*.zip'))), 5)
        for name, expected in checksums.items():
            self.assertEqual(publisher.digest(self.destination / name), expected)

    def test_rejects_modified_installer_before_publication(self):
        installer = next(self.source.rglob('*.exe'))
        installer.write_bytes(b'modified after checksum')
        with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
            publisher.assemble(self.source, self.destination, '1.0.1-rc.1')

    def test_rejects_manifest_that_omits_an_installer(self):
        manifest = self.source / 'seminai-win-x64/SHA256SUMS.txt'
        manifest.write_text('\n'.join(
            line for line in manifest.read_text().splitlines() if not line.endswith('.exe')
        ))
        with self.assertRaisesRegex(ValueError, 'omits release files'):
            publisher.assemble(self.source, self.destination, '1.0.1-rc.1')

    def test_publishes_canonical_linux_bundle_despite_host_specific_emission(self):
        folder = self.source / 'seminai-win-x64'
        bundle = folder / 'seminai-mcp-1.0.1.mcpb'
        with zipfile.ZipFile(bundle, 'w') as archive:
            archive.writestr('server/server.cjs', 'synthetic Windows interop emission')
            archive.writestr('manifest.json', '{}')
        self.refresh_manifest(folder)
        publisher.assemble(self.source, self.destination, '1.0.1-rc.1')
        with zipfile.ZipFile(self.destination / bundle.name) as archive:
            self.assertEqual(archive.read('server/server.cjs'), b'synthetic connector')

    def test_rejects_divergent_connector_contracts(self):
        folder = self.source / 'seminai-mac-x64'
        with zipfile.ZipFile(folder / 'seminai-mcp-1.0.1.mcpb', 'w') as archive:
            archive.writestr('server/server.cjs', 'synthetic connector')
            archive.writestr('manifest.json', '{"version":"different"}')
        self.refresh_manifest(folder)
        with self.assertRaisesRegex(ValueError, 'manifests differ'):
            publisher.assemble(self.source, self.destination, '1.0.1-rc.1')

    def test_reads_draft_assets_by_id_before_publishing(self):
        with patch.object(publisher, 'gh', side_effect=[
            '[{"id":42,"tag_name":"v1.0.1-rc.1","draft":true}]',
            '{"id":42,"assets":[]}',
        ]) as api:
            self.assertEqual(publisher.read_uploaded_release('synthetic/repo', 'v1.0.1-rc.1'),
                             {'id':42, 'assets':[]})
            self.assertEqual(api.call_args.args, ('api', 'repos/synthetic/repo/releases/42'))

    @staticmethod
    def refresh_manifest(folder):
        (folder / 'SHA256SUMS.txt').write_text(''.join(
            f'{publisher.digest(file)}  {file.name}\n' for file in folder.iterdir()
            if file.name != 'SHA256SUMS.txt'
        ))


if __name__ == '__main__':
    unittest.main()
