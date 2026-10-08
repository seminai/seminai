import { readFile } from 'node:fs/promises';
const tag = process.env.GITHUB_REF_NAME || '';
if (process.env.GITHUB_REF_TYPE === 'tag') {
  const desktop = JSON.parse(await readFile('packages/desktop/package.json', 'utf8'));
  if (tag !== `v${desktop.version}`) throw new Error('Tag and desktop version must match');
}
if (process.env.GITHUB_REF_TYPE === 'tag' && !tag.includes('-rc.')) {
  const target = process.env.DESKTOP_TARGET;
  const required = target === 'mac'
    ? ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
    : target === 'win' ? ['CSC_LINK', 'CSC_KEY_PASSWORD'] : [];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Stable distribution requires signing credentials: ${missing.join(', ')}`);
}
