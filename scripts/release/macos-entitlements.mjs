import path from 'node:path';

export function signingOptions(file, { runtime, arch }) {
  const entitlements = ['com.apple.security.cs.allow-jit'];
  // Standalone Node 22 on Intel uses executable pages without MAP_JIT.
  // Keep this exception away from Electron, its renderer and native libraries.
  if (arch === 'x64' && path.resolve(file) === path.join(runtime, 'node'))
    entitlements.push('com.apple.security.cs.allow-unsigned-executable-memory');
  return { hardenedRuntime: true, entitlements };
}
