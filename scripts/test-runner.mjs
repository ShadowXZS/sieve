import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';

const args = process.argv.slice(2);
let testFiles = args;

if (testFiles.length === 0) {
  testFiles = [
    ...globSync('tests/wasm/*.test.ts'),
    ...globSync('tests/unit/*.test.ts'),
    ...globSync('tests/components/*.test.tsx'),
    ...globSync('tests/e2e/*.test.ts'),
  ];
}

const child = spawn(
  process.execPath,
  ['--import', 'tsx', '--import', './tests/setup.ts', '--test', '--test-concurrency=1', ...testFiles],
  { stdio: 'inherit' }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

