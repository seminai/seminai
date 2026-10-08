import { signAsync } from '@electron/osx-sign';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, openSync, readSync, closeSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(process.argv[2] || 'artifacts/signing/rc1/source');
const destination = path.resolve(process.argv[3] || 'artifacts/signing/rc1/signed');
const identity = process.env.MACOS_DEVELOPER_ID;
const profile = process.env.APPLE_KEYCHAIN_PROFILE;
const keychain = process.env.APPLE_KEYCHAIN;
if (process.platform !== 'darwin' || !identity || !profile) throw new Error('macOS, Developer ID and a notarization profile are required');
const version = JSON.parse(await readFile('packages/desktop/package.json', 'utf8')).version;
const manifest = await readFile(path.join(source, 'SHA256SUMS.txt'), 'utf8');

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '', error = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { error += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`${command}: ${error.slice(-6000)} ${output.slice(-2000)}`)));
  });
}
function isCode(file) {
  if (statSync(file).isDirectory()) return /\.(app|framework)$/.test(file);
  const descriptor = openSync(file, 'r');
  try {
    const header = Buffer.alloc(4); readSync(descriptor, header, 0, 4, 0);
    return ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(header.toString('hex'));
  } finally { closeSync(descriptor); }
}

await mkdir(destination, { recursive: true });
const receipts = [];
for (const arch of ['arm64', 'x64']) {
  const original = `Seminai-${version}-mac-${arch}.zip`;
  const expected = manifest.split('\n').find((line) => line.endsWith(`  ${original}`))?.split('  ')[0];
  if (!expected || await digest(path.join(source, original)) !== expected) throw new Error(`Source checksum mismatch: ${original}`);
  const work = path.join(destination, `work-${arch}`);
  await mkdir(work); // A previous attempt must be inspected, never overwritten silently.
  await run('ditto', ['-xk', path.join(source, original), work]);
  const app = path.join(work, 'Seminai.app');
  const bundle = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Contents/Info.plist')])).trim();
  if (bundle !== 'it.seminai.desktop') throw new Error('Unexpected app identifier');
  console.log(`Signing ${arch} application and bundled runtimes…`);
  await signAsync({
    app, identity, platform: 'darwin', type: 'distribution', gatekeeperAssess: false,
    ignore: [(file) => !isCode(file)],
    optionsForFile: () => ({ hardenedRuntime: true, entitlements: ['com.apple.security.cs.allow-jit'] }),
  });
  await run('codesign', ['--verify', '--deep', '--strict', app]);
  const runtime = path.join(app, 'Contents/Resources/runtime');
  await run(path.join(runtime, 'node'), [path.resolve('packages/desktop/scripts/smoke.cjs')], {
    env: { ...process.env, SEMINAI_RUNTIME_DIR: runtime },
  });
  await symlink('/Applications', path.join(work, 'Applications'));
  const dmg = path.join(destination, `Seminai-${version}-mac-${arch}-signed.dmg`);
  await run('hdiutil', ['create', '-volname', 'Seminai', '-srcfolder', work, '-format', 'UDZO', dmg]);
  await run('codesign', ['--sign', identity, '--timestamp', dmg]);
  console.log(`Submitting ${arch} installer for Apple notarization…`);
  const authentication = ['--keychain-profile', profile, ...(keychain ? ['--keychain', keychain] : [])];
  const submission = JSON.parse(await run('xcrun', ['notarytool', 'submit', dmg, ...authentication, '--wait', '--output-format', 'json']));
  await writeFile(path.join(destination, `notary-${arch}.json`), JSON.stringify(submission, null, 2));
  if (submission.status !== 'Accepted') throw new Error(`Notarization ${arch}: ${submission.status}`);
  await run('xcrun', ['stapler', 'staple', app]);
  await run('xcrun', ['stapler', 'staple', dmg]);
  await run('xcrun', ['stapler', 'validate', dmg]);
  await run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  const zip = path.join(destination, `Seminai-${version}-mac-${arch}-signed.zip`);
  await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
  receipts.push({ arch, source: original, sourceSha256: expected, submissionId: submission.id,
    signed: true, notarized: true, gatekeeper: true,
    files: [{ name: path.basename(dmg), sha256: await digest(dmg) }, { name: path.basename(zip), sha256: await digest(zip) }],
  });
  await writeFile(path.join(destination, 'signing-macos.json'), JSON.stringify({ version, receipts }, null, 2));
  console.log(`PASS: ${arch} signature, installed runtime, notarization, stapling and Gatekeeper.`);
}
await writeFile(path.join(destination, 'SHA256SUMS-macos-signed.txt'), receipts.flatMap((row) => row.files).map((file) => `${file.sha256}  ${file.name}\n`).join(''));
