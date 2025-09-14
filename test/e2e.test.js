import { describe, it, expect } from 'vitest';
import { SlideFixer } from '../src/pipeline.js';
import { createConfig } from '../src/config.js';
import { promises as fs } from 'fs';
import { spawnSync } from 'child_process';

const haveMarp = () => spawnSync('npx', ['@marp-team/marp-cli', '--version'], { shell: true, timeout: 10000 }).status === 0;

describe.skipIf(!process.env.VITEST_E2E)('E2E (Marp CLI + Puppeteer)', () => {
  it.skipIf(!haveMarp())('renders and detects overflow then fixes', async () => {
    const tmpDir = '.tmp-test';
    await fs.mkdir(tmpDir, { recursive: true });
    const input = `${tmpDir}/e2e.md`;
    const output = `${tmpDir}/e2e_out.md`;
    const long = 'テキスト'.repeat(150) + '。' + '続き'.repeat(150);
    const md = `---\nmarp: true\n---\n\n# 見出し\n\n${long}`;
    await fs.writeFile(input, md, 'utf-8');
    const fixer = new SlideFixer(createConfig({ maxIter: 2 }));
    try {
      await fixer.fix(input, output);
    } catch (e) {
      throw new Error('Pipeline failed in E2E: ' + e.message);
    }
    const out = await fs.readFile(output, 'utf-8');
    expect(out.split('\n---\n').length).toBeGreaterThan(1); // 分割された
  }, 120000);
});