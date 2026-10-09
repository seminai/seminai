import 'dotenv/config';
import { bootstrapInstanceSecrets } from './bootstrapSecrets';
import { bootstrapInviteCode } from './bootstrapInviteCode';
import { validateRuntimeEnv } from './validateRuntimeEnv';
import { resolveRuntimeEntry } from './resolveAppMode';

bootstrapInstanceSecrets();
bootstrapInviteCode();
validateRuntimeEnv();
const { applyPersistedInstanceSettings } = await import('../settings/instanceSettingSingleton');
await applyPersistedInstanceSettings();

if (resolveRuntimeEntry() === 'worker') {
  await import('../worker/worker');
} else {
  await import('../http/server');
}
