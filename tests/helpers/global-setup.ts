// Compile src/*.ts → src/*.js once before any test runs. The unit/integration
// harness loads the *compiled* output (it reads src/*.js as text and evals it),
// so without this a stale build would be tested. Running it as a vitest
// globalSetup — instead of an npm `pretest` hook — means even a direct
// `npx vitest run` (which bypasses npm lifecycle hooks) tests current source.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const tsc = path.join(root, 'node_modules', '.bin', 'tsc');
  execFileSync(tsc, ['-p', 'tsconfig.src.json'], { cwd: root, stdio: 'inherit' });
}
