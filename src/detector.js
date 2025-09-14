/**
 * overflow検知器 - Puppeteerを使用してMarpスライドのoverflowを検知
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Marp CLIでMarkdownをHTMLに変換
 */
export async function generateHTML(markdownPath, outputPath, config) {
  return new Promise((resolve, reject) => {
    const marpArgs = [
      '--html',
      '--allow-local-files',
      '--output', outputPath,
      markdownPath
    ];

    console.log(chalk.blue('🔧 Generating HTML with Marp CLI...'));
    
    const marpProcess = spawn('npx', ['@marp-team/marp-cli', ...marpArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true // Windows環境でのパス解決を改善
    });

    let stdout = '';
    let stderr = '';

    marpProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    marpProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    marpProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ HTML generated successfully'));
        resolve({ stdout, stderr });
      } else {
        console.error(chalk.red('❌ Marp CLI failed:'), stderr);
        reject(new Error(`Marp CLI failed with code ${code}: ${stderr}`));
      }
    });

    marpProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('Marp CLI not found. Please install Marp CLI: npm install -g @marp-team/marp-cli'));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Puppeteerでoverflowを検知
 */
export class OverflowDetector {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    console.log(chalk.blue('🚀 Launching browser...'));
    
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport(this.config.viewport);

    console.log(chalk.green('✅ Browser ready'));
  }

  async detectOverflow(htmlPath) {
    if (!this.page) {
      throw new Error('Detector not initialized. Call initialize() first.');
    }

    console.log(chalk.blue('🔍 Analyzing slides for overflow...'));

    // HTMLファイルを読み込み
    await this.page.goto(`file://${path.resolve(htmlPath)}`, {
      waitUntil: 'networkidle0'
    });

    // スライド要素を取得
    const slideElements = await this.page.$$('section');
    console.log(chalk.cyan(`📊 Found ${slideElements.length} slides to analyze`));

    const overflowResults = [];

    for (let i = 0; i < slideElements.length; i++) {
      const slideElement = slideElements[i];
      
      // 各スライドのoverflow状態をチェック
      const overflowInfo = await this.page.evaluate((element, slideIndex) => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        
        // スライドのサイズ情報
        const clientWidth = element.clientWidth;
        const clientHeight = element.clientHeight;
        const scrollWidth = element.scrollWidth;
        const scrollHeight = element.scrollHeight;

        // overflow判定
        const hasHorizontalOverflow = scrollWidth > clientWidth;
        const hasVerticalOverflow = scrollHeight > clientHeight;
        const hasOverflow = hasHorizontalOverflow || hasVerticalOverflow;

        // 詳細な要素分析
        const childElements = Array.from(element.children);
        const problematicElements = [];

        childElements.forEach((child, childIndex) => {
          const childRect = child.getBoundingClientRect();
          const childComputedStyle = window.getComputedStyle(child);
          
          // 親要素からはみ出している要素を特定
          if (childRect.bottom > rect.bottom || childRect.right > rect.right ||
              childRect.top < rect.top || childRect.left < rect.left) {
            
            problematicElements.push({
              tagName: child.tagName.toLowerCase(),
              className: child.className,
              index: childIndex,
              dimensions: {
                width: childRect.width,
                height: childRect.height
              },
              overflowType: {
                bottom: childRect.bottom > rect.bottom,
                right: childRect.right > rect.right,
                top: childRect.top < rect.top,
                left: childRect.left < rect.left
              }
            });
          }
        });

        // テキスト量の測定
        const textContent = element.textContent || '';
        const textLength = textContent.length;
        
        // リスト項目数の計算
        const listItems = element.querySelectorAll('li');
        const listItemCount = listItems.length;

        // 特殊要素の検出
        const hasCodeBlock = element.querySelector('pre, code') !== null;
        const hasTable = element.querySelector('table') !== null;
        const hasImage = element.querySelector('img') !== null;
        const hasMath = element.querySelector('.katex, .math') !== null;

        return {
          slideIndex: slideIndex + 1,
          hasOverflow,
          hasHorizontalOverflow,
          hasVerticalOverflow,
          dimensions: {
            clientWidth,
            clientHeight,
            scrollWidth,
            scrollHeight
          },
          overflowAmount: {
            horizontal: Math.max(0, scrollWidth - clientWidth),
            vertical: Math.max(0, scrollHeight - clientHeight)
          },
          contentInfo: {
            textLength,
            listItemCount,
            hasCodeBlock,
            hasTable,
            hasImage,
            hasMath
          },
          problematicElements
        };
      }, slideElement, i);

      overflowResults.push(overflowInfo);

      // ログ出力
      if (overflowInfo.hasOverflow) {
        console.log(chalk.yellow(`⚠️  Slide ${overflowInfo.slideIndex}: Overflow detected`));
        if (overflowInfo.hasVerticalOverflow) {
          console.log(chalk.gray(`   Vertical: +${overflowInfo.overflowAmount.vertical}px`));
        }
        if (overflowInfo.hasHorizontalOverflow) {
          console.log(chalk.gray(`   Horizontal: +${overflowInfo.overflowAmount.horizontal}px`));
        }
        
        // 問題要素の詳細
        if (overflowInfo.problematicElements.length > 0) {
          console.log(chalk.gray(`   Problematic elements: ${overflowInfo.problematicElements.map(el => el.tagName).join(', ')}`));
        }
      } else {
        console.log(chalk.green(`✅ Slide ${overflowInfo.slideIndex}: OK`));
      }
    }

    const overflowCount = overflowResults.filter(result => result.hasOverflow).length;
    console.log(chalk.cyan(`📈 Analysis complete: ${overflowCount}/${slideElements.length} slides have overflow`));

    return overflowResults;
  }

  async cleanup() {
    if (this.browser) {
      console.log(chalk.blue('🧹 Closing browser...'));
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * 一時ファイル管理
 */
export class TempFileManager {
  constructor(tempDir) {
    this.tempDir = tempDir;
    this.files = new Set();
  }

  async initialize() {
    await fs.mkdir(this.tempDir, { recursive: true });
    console.log(chalk.blue(`📁 Created temp directory: ${this.tempDir}`));
  }

  async createTempFile(content, extension = '.html') {
    const fileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filePath = path.join(this.tempDir, fileName);
    
    await fs.writeFile(filePath, content, 'utf-8');
    this.files.add(filePath);
    
    return filePath;
  }

  async saveTempMarkdown(content) {
    return this.createTempFile(content, '.md');
  }

  async cleanup() {
    console.log(chalk.blue(`🧹 Cleaning up ${this.files.size} temporary files...`));
    
    for (const filePath of this.files) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to delete ${filePath}: ${error.message}`));
      }
    }

    try {
      await fs.rmdir(this.tempDir);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Failed to remove temp directory: ${error.message}`));
    }

    this.files.clear();
    console.log(chalk.green('✅ Cleanup complete'));
  }
}

/**
 * 統合検知関数
 */
export async function analyzeSlideOverflow(markdownContent, config) {
  const tempManager = new TempFileManager(config.tempDir);
  const detector = new OverflowDetector(config);

  try {
    await tempManager.initialize();
    await detector.initialize();

    // 一時Markdownファイル作成
    const tempMarkdownPath = await tempManager.saveTempMarkdown(markdownContent);
    const tempHtmlPath = await tempManager.createTempFile('', '.html');

    // HTML生成
    await generateHTML(tempMarkdownPath, tempHtmlPath, config);

    // overflow検知
    const results = await detector.detectOverflow(tempHtmlPath);

    return results;

  } finally {
    await detector.cleanup();
    await tempManager.cleanup();
  }
}
