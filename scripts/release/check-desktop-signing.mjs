import { readFile } from 'node:fs/promises';
const tag = process.env.GITHUB_REF_NAME || '';
if (process.env.GITHUB_REF_TYPE === 'tag') {
  const desktop = JSON.parse(await readFile('packages/desktop/package.json', 'utf8'));
  if (tag !== `v${desktop.version}`) throw new Error('Tag and desktop version must match');
}
if ((process.env.GITHUB_REF_TYPE === 'tag' && !tag.includes('-rc.')) || process.env.SEMINAI_SIGNING === 'true') {
  const target = process.env.DESKTOP_TARGET;
  const hasAppleProfile = Boolean(process.env.APPLE_KEYCHAIN_PROFILE);
  const hasAppleIdentity = Boolean(process.env.MACOS_DEVELOPER_ID);
  const hasAzure = Boolean(process.env.AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME);
  const required = target === 'mac'
    ? [
      ...(hasAppleIdentity ? [] : ['CSC_LINK', 'CSC_KEY_PASSWORD']),
      ...(hasAppleProfile ? [] : ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']),
    ]
    : target === 'win' ? (hasAzure ? [
      'AZURE_ARTIFACT_SIGNING_ENDPOINT', 'AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME',
      'AZURE_ARTIFACT_SIGNING_CERT_PROFILE_NAME',
    ] : ['CSC_LINK', 'CSC_KEY_PASSWORD']) : [];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Signed distribution requires signing credentials: ${missing.join(', ')}`);
}
