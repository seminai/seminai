import 'dotenv/config';
import { resolveRuntimeEntry } from './resolveAppMode';

if (resolveRuntimeEntry() === 'worker') {
  await import('../worker/worker');
} else {
  await import('../http/server');
}
