// scripts/validate-*.mjs 를 전부 실행하고 결과를 한 번에 보여줍니다.
// 하나가 실패해도 멈추지 않고 끝까지 돌린 뒤, 실패가 있으면 종료 코드 1을 반환합니다.
//
// 실행 위치와 무관하게 동작합니다: npm run validate:all
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = 'validate-all.mjs';

const scripts = readdirSync(HERE)
  .filter(name => name.startsWith('validate-') && name.endsWith('.mjs') && name !== SELF)
  .sort();

const failures = [];

for (const name of scripts) {
  const result = spawnSync(process.execPath, [join(HERE, name)], { encoding: 'utf8' });
  const ok = result.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    failures.push(name);
    const detail = `${result.stdout || ''}${result.stderr || ''}`
      .split('\n')
      .filter(line => /Error:|^- |│/.test(line))
      .slice(0, 6);
    detail.forEach(line => console.log(`        ${line.trim()}`));
  }
}

console.log(`\n${scripts.length - failures.length}/${scripts.length} 통과`);
if (failures.length) {
  console.log(`실패: ${failures.join(', ')}`);
  process.exit(1);
}
