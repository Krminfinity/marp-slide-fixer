import { describe, it, expect, vi } from 'vitest';
import { SlideFixer } from '../src/pipeline.js';
import { createConfig } from '../src/config.js';

// detectorをモック
vi.mock('../src/detector.js', () => ({
  analyzeSlideOverflow: vi.fn(async (md) => {
    const slideCount = (md.match(/\n---\n/g) || []).length + 1;
    // 1枚目のみ overflow とする
    return Array.from({length: slideCount}).map((_,i) => i === 0 ? {
      slideIndex: 1,
      hasOverflow: true,
      hasHorizontalOverflow: false,
      hasVerticalOverflow: true,
      dimensions: { clientWidth:100, clientHeight:100, scrollWidth:100, scrollHeight:160 },
      overflowAmount: { horizontal:0, vertical:60 },
      contentInfo: { textLength: 900, listItemCount:0, hasCodeBlock:false, hasTable:false, hasImage:false },
      problematicElements: []
    } : {
      slideIndex: i+1,
      hasOverflow: false,
      hasHorizontalOverflow: false,
      hasVerticalOverflow: false,
      dimensions: { clientWidth:100, clientHeight:100, scrollWidth:100, scrollHeight:100 },
      overflowAmount: { horizontal:0, vertical:0 },
      contentInfo: { textLength: 50, listItemCount:0, hasCodeBlock:false, hasTable:false, hasImage:false },
      problematicElements: []
    });
  })
}));

describe('Marp-only validation and processing', () => {
  it('rejects non-Marp markdown (no front-matter)', async () => {
    const fixer = new SlideFixer(createConfig({ maxIter:1 }));
    const { promises: fs } = await import('fs');
    await fs.mkdir('.tmp-test', { recursive: true });
    const input = '.tmp-test/plain.md';
    const output = '.tmp-test/out.md';
    await fs.writeFile(input, '# Title\n\nJust text','utf-8');
    await expect(fixer.fix(input, output)).rejects.toThrow(/not a valid Marp/);
  });

  it('accepts Marp markdown and performs split/scaling', async () => {
    const fixer = new SlideFixer(createConfig({ maxIter:2, paragraphMaxChars:400 }));
    const { promises: fs } = await import('fs');
    await fs.mkdir('.tmp-test', { recursive: true });
    const longParagraph = 'あ'.repeat(300) + '。' + 'い'.repeat(300) + '。' + 'う'.repeat(300);
    const marpMd = `---\nmarp: true\ntheme: default\n---\n\n# 見出し\n\n${longParagraph}`;
    const input = '.tmp-test/marp.md';
    const output = '.tmp-test/marp_out.md';
    await fs.writeFile(input, marpMd, 'utf-8');
    await fixer.fix(input, output);
    expect(fixer.stats.slidesSplit).toBeGreaterThan(0);
    const out = await fs.readFile(output,'utf-8');
    expect(out).toMatch(/^---/);
    expect(out).toMatch(/marp: true/);
  });

  it('applies local scaling for table and image before global scaling', async () => {
    // detectorモック差し替え（テスト後 restore）
    const detectorModule = await import('../src/detector.js');
    const localMock = vi.spyOn(detectorModule, 'analyzeSlideOverflow').mockImplementation(async (md) => {
      // スライド1: table overflow, スライド2: image overflow
      return [
        {
          slideIndex:1,
          hasOverflow:true,
          hasHorizontalOverflow:false,
          hasVerticalOverflow:true,
          dimensions:{ clientWidth:100, clientHeight:100, scrollWidth:100, scrollHeight:170 },
          overflowAmount:{ horizontal:0, vertical:70 },
          contentInfo:{ textLength:200, listItemCount:0, hasCodeBlock:false, hasTable:true, hasImage:false },
          problematicElements:[]
        },
        {
          slideIndex:2,
          hasOverflow:true,
          hasHorizontalOverflow:false,
          hasVerticalOverflow:true,
          dimensions:{ clientWidth:100, clientHeight:100, scrollWidth:100, scrollHeight:160 },
          overflowAmount:{ horizontal:0, vertical:60 },
          contentInfo:{ textLength:150, listItemCount:0, hasCodeBlock:false, hasTable:false, hasImage:true },
          problematicElements:[]
        }
      ];
    });

    const fixer = new SlideFixer(createConfig({ maxIter:1 }));
    const { promises: fs } = await import('fs');
    await fs.mkdir('.tmp-test', { recursive: true });
    const md = `---\nmarp: true\n---\n\n# Table Slide\n\n| H1 | H2 |\n|----|----|\n| a | b |\n\n---\n# Image Slide\n\n![alt](img.png)`;
    const input = '.tmp-test/table_image.md';
    const output = '.tmp-test/table_image_out.md';
    await fs.writeFile(input, md, 'utf-8');
    await fixer.fix(input, output);
    expect(fixer.stats.slidesWithLocalScaling).toBeGreaterThanOrEqual(2);
    expect(fixer.stats.slidesWithGlobalScaling).toBe(0); // maxIter:1 で局所のみ
    localMock.mockRestore();
  });
});
