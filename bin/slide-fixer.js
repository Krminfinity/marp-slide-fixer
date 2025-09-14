#!/usr/bin/env node

/**
 * Marp Slide Fixer CLI エントリポイント
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import { SlideFixer } from '../src/pipeline.js';
import { createConfig } from '../src/config.js'; // fallback 用（将来拡張余地）
import { loadMergedConfig } from '../src/configLoader.js';

const program = new Command();

// メイン処理
async function main() {
  try {
    console.log(chalk.blue('🎯 Marp Slide Fixer v1.0.0'));
    console.log(chalk.gray('   Automatic overflow detection and slide splitting tool\n'));

    // CLI設定
    program
      .name('slide-fixer')
      .description('Marp Slide Fixer - 自動overflow検知・修正ツール')
      .version('1.0.0')
      .requiredOption('--in <input>', '入力Markdownファイルパス')
      .requiredOption('--out <output>', '出力Markdownファイルパス')
      .option('--max-iter <number>', '最大反復回数', '3')
      .option('--list-max-items <number>', 'リスト項目分割しきい値', '10')
      .option('--paragraph-max-chars <number>', '段落文字数分割しきい値', '600')
      .option('--font-step <number>', 'フォント縮小ステップ', '0.95')
      .option('--font-min <number>', 'フォント最小サイズ', '0.7')
      .option('--log-level <level>', 'ログレベル', 'info')
      .option('--config <path>', '設定ファイルパス (slide-fixer.config.json などを上書き)');

    program.parse();
  const options = program.opts();

    // 入力検証
    try {
      await fs.access(options.in);
    } catch (error) {
      console.error(chalk.red('❌ Input file not found:'), options.in);
      process.exit(1);
    }

    // 出力ディレクトリの作成
    const outputDir = path.dirname(options.out);
    await fs.mkdir(outputDir, { recursive: true });

    // 設定マージ (ファイル + CLI)
    const { config, configFile } = await loadMergedConfig({
      configPath: options.config,
      maxIter: options.maxIter,
      listMaxItems: options.listMaxItems,
      paragraphMaxChars: options.paragraphMaxChars,
      fontStep: options.fontStep,
      fontMin: options.fontMin,
      logLevel: options.logLevel,
      tempDir: path.join(process.cwd(), '.marp-slide-fixer-temp')
    });

    console.log(chalk.cyan('⚙️  Configuration:'));
    if (configFile) {
      console.log(chalk.gray(`   • Loaded from: ${configFile}`));
    }
    console.log(chalk.gray(`   • Max iterations: ${config.maxIter}`));
    console.log(chalk.gray(`   • List split threshold: ${config.listMaxItems} items`));
    console.log(chalk.gray(`   • Paragraph split threshold: ${config.paragraphMaxChars} chars`));
    console.log(chalk.gray(`   • Font scaling: ${config.fontStep} (min: ${config.fontMin})`));
    console.log(chalk.gray(`   • Log level: ${config.logLevel}\n`));

    // 処理実行
    const fixer = new SlideFixer(config);
    await fixer.fix(options.in, options.out);

    console.log(chalk.green('🎉 Processing completed successfully!'));
    console.log(chalk.cyan(`📄 Output saved to: ${options.out}`));

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

// エントリポイント
main();
