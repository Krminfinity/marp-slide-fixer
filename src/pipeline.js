/**
 * パイプライン制御 - 全体フロー・反復処理・状態管理
 */
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { 
  parseMarkdown, 
  stringifyAST, 
  extractSlides, 
  reconstructAST, 
  estimateComplexity,
  splitSlide,
  addStyleClass,
  updateFrontmatter
} from './markdown.js';
import { analyzeSlideOverflow } from './detector.js';
import { SCALING_STYLES } from './config.js';

/**
 * スライド修正パイプライン
 */
export class SlideFixer {
  constructor(config) {
    this.config = config;
    this.stats = {
      totalSlides: 0,
      slidesSplit: 0,
      slidesWithLocalScaling: 0,
      slidesWithGlobalScaling: 0,
      iterations: 0
    };
  }

  /**
   * メイン処理
   */
  async fix(inputPath, outputPath) {
    console.log(chalk.blue('🔧 Starting Marp Slide Fixer...'));
    console.log(chalk.cyan(`📄 Input: ${inputPath}`));
    console.log(chalk.cyan(`📄 Output: ${outputPath}`));

    try {
      // 入力ファイル読み込み
      const markdownContent = await fs.readFile(inputPath, 'utf-8');
      console.log(chalk.green('✅ Input file loaded'));

      // 初期AST解析
      const ast = await parseMarkdown(markdownContent);
      let slides = extractSlides(ast);
      this.stats.totalSlides = slides.length;

      // Marp front-matter 検証: 最初のスライドに front-matter が存在し、marp: true もしくは theme/size/paginate のいずれかが存在
      const firstFront = slides[0]?.frontmatter?.value || '';
      const hasMarpKey = /(^|\n)marp:\s*true\b/.test(firstFront);
      const hasTheme = /(^|\n)theme:\s*.+/.test(firstFront);
      if (!firstFront || !(hasMarpKey || hasTheme)) {
        throw new Error('Input is not a valid Marp markdown (front-matter with at least `marp: true` or `theme:` required).');
      }

      console.log(chalk.cyan(`📊 Found ${slides.length} slides to process`));

      // 反復処理
      for (let iteration = 1; iteration <= this.config.maxIter; iteration++) {
        this.stats.iterations = iteration;
        console.log(chalk.blue(`\n🔄 Iteration ${iteration}/${this.config.maxIter}`));

        // 現在の状態でoverflowを検知
        const currentMarkdown = await stringifyAST(reconstructAST(slides));
        const overflowResults = await analyzeSlideOverflow(currentMarkdown, this.config);

        const overflowSlides = overflowResults.filter(result => result.hasOverflow);
        
        if (overflowSlides.length === 0) {
          console.log(chalk.green('🎉 All slides are now properly fitted!'));
          break;
        }

        console.log(chalk.yellow(`⚠️  ${overflowSlides.length} slides still have overflow`));

        // 各overflowスライドを処理
        let anyChanges = false;
        
        for (const overflowResult of overflowSlides) {
          const slideIndex = overflowResult.slideIndex - 1;
          const slide = slides[slideIndex];

          console.log(chalk.magenta(`\n🔧 Processing slide ${overflowResult.slideIndex}...`));

          // まず分割を試行
          const splitResult = await this.trySplitSlide(slide, overflowResult);
          
          if (splitResult.success) {
            // 分割が成功した場合
            slides.splice(slideIndex, 1, ...splitResult.newSlides);
            anyChanges = true;
            this.stats.slidesSplit++;
            
            console.log(chalk.green(`✅ Slide ${overflowResult.slideIndex} split into ${splitResult.newSlides.length} slides`));
          } else {
            // 分割が失敗した場合、縮小を適用
            const scalingResult = await this.applyScaling(slide, overflowResult);
            
            if (scalingResult.applied) {
              slides[slideIndex] = scalingResult.modifiedSlide;
              anyChanges = true;
              
              if (scalingResult.type === 'local') {
                this.stats.slidesWithLocalScaling++;
                console.log(chalk.yellow(`⚖️  Applied local scaling to slide ${overflowResult.slideIndex}`));
              } else {
                this.stats.slidesWithGlobalScaling++;
                console.log(chalk.yellow(`⚖️  Applied global scaling to slide ${overflowResult.slideIndex}`));
              }
            }
          }
        }

        // 変更がなかった場合は終了
        if (!anyChanges) {
          console.log(chalk.yellow('⚠️  No more improvements possible'));
          break;
        }
      }

      // 最終結果を保存
      const finalAST = reconstructAST(slides);
      const finalMarkdown = await stringifyAST(finalAST);
      await fs.writeFile(outputPath, finalMarkdown, 'utf-8');

      console.log(chalk.green('✅ Processing completed successfully!'));
      this.printStats();

    } catch (error) {
      console.error(chalk.red('❌ Error during processing:'), error.message);
      throw error;
    }
  }

  /**
   * スライド分割を試行
   */
  async trySplitSlide(slide, overflowResult) {
    const complexity = estimateComplexity(slide.content);
    
    console.log(chalk.gray(`   Complexity: ${complexity.complexity} (text: ${complexity.textLength}, lists: ${complexity.listItemCount})`));

    // 分割が適さない場合をチェック
    if (complexity.hasTable || complexity.hasImage) {
      console.log(chalk.gray('   ⏭️  Skipping split: contains table or image'));
      return { success: false };
    }

    // 単一のコードブロックのみの場合もスキップ
    if (complexity.hasCodeBlock && slide.content.length === 1) {
      console.log(chalk.gray('   ⏭️  Skipping split: single code block'));
      return { success: false };
    }

    // 分割を試行
    const splitSlides = splitSlide(slide.content, this.config);
    
    if (splitSlides.length > 1) {
      const newSlides = splitSlides.map((slideContent, index) => ({
        frontmatter: index === 0 ? slide.frontmatter : null,
        content: slideContent
      }));
      
      return { 
        success: true, 
        newSlides 
      };
    }

    console.log(chalk.gray('   ⏭️  No natural split points found'));
    return { success: false };
  }

  /**
   * 縮小処理を適用
   */
  async applyScaling(slide, overflowResult) {
    let modified = false;
    let scalingType = 'none';
    let modifiedSlide = { ...slide };

    // まず局所的な縮小を試行
    const localScaling = this.getLocalScalingStyle(overflowResult);
    if (localScaling) {
      modifiedSlide = this.applyLocalScaling(modifiedSlide, localScaling);
      modified = true;
      scalingType = 'local';
      console.log(chalk.gray(`   Applied local scaling: ${localScaling.type}`));
      // ポリシー: 局所縮小を適用したイテレーションでは、即座に全体縮小を適用せず次の再計測に委ねる
      return { applied: modified, type: scalingType, modifiedSlide };
    }

    // 局所縮小手段が無い場合にのみ全体縮小を検討
    const globalScaling = this.calculateGlobalScaling(overflowResult);
    if (globalScaling.fontSize < 1.0 && this.shouldApplyGlobalScaling(overflowResult)) {
      modifiedSlide = this.applyGlobalScaling(modifiedSlide, globalScaling.fontSize);
      modified = true;
      scalingType = 'global';
      console.log(chalk.gray(`   Applied global scaling: ${Math.round(globalScaling.fontSize * 100)}%`));
    }

    return { applied: modified, type: scalingType, modifiedSlide };
  }

  /**
   * 局所縮小スタイルの決定
   */
  getLocalScalingStyle(overflowResult) {
    const { contentInfo } = overflowResult;

    if (contentInfo.hasCodeBlock) {
      return { type: 'code', style: SCALING_STYLES.code };
    }
    
    if (contentInfo.hasTable) {
      return { type: 'table', style: SCALING_STYLES.table };
    }
    
    if (contentInfo.hasImage) {
      return { type: 'image', style: SCALING_STYLES.image };
    }

    return null;
  }

  /**
   * 局所縮小の適用
   */
  applyLocalScaling(slide, scaling) {
    // front-matterにスタイルを追加
    if (slide.frontmatter) {
      slide.frontmatter = updateFrontmatter(slide.frontmatter, scaling.style);
    }

    return slide;
  }

  /**
   * 全体縮小が必要かどうかの判定
   */
  shouldApplyGlobalScaling(overflowResult) {
    const verticalOverflow = overflowResult.overflowAmount.vertical;
    const horizontalOverflow = overflowResult.overflowAmount.horizontal;
    
    // 大きなoverflowがある場合は全体縮小も適用
    return verticalOverflow > 50 || horizontalOverflow > 50;
  }

  /**
   * 全体縮小率の計算
   */
  calculateGlobalScaling(overflowResult) {
    const verticalRatio = overflowResult.dimensions.clientHeight / 
                          overflowResult.dimensions.scrollHeight;
    const horizontalRatio = overflowResult.dimensions.clientWidth / 
                            overflowResult.dimensions.scrollWidth;
    
    // 最も制約の厳しい比率を選択し、さらにマージンを考慮
    const targetRatio = Math.min(verticalRatio, horizontalRatio) * 0.95;
    
    // 設定された範囲内で調整
    const fontSize = Math.max(this.config.fontMin, targetRatio);
    
    return { fontSize };
  }

  /**
   * 全体縮小の適用
   */
  applyGlobalScaling(slide, fontSize) {
    const className = `slide-scaled-${Math.round(fontSize * 100)}`;
    const style = SCALING_STYLES.generic(fontSize);

    // コンテンツにクラスを適用
    slide.content = addStyleClass(slide.content, className);

    // front-matterにスタイルを追加
    if (slide.frontmatter) {
      slide.frontmatter = updateFrontmatter(slide.frontmatter, style);
    }

    return slide;
  }

  /**
   * 統計情報の表示
   */
  printStats() {
    console.log(chalk.blue('\n📊 Processing Summary:'));
    console.log(chalk.cyan(`  • Total slides processed: ${this.stats.totalSlides}`));
    console.log(chalk.cyan(`  • Slides split: ${this.stats.slidesSplit}`));
    console.log(chalk.cyan(`  • Slides with local scaling: ${this.stats.slidesWithLocalScaling}`));
    console.log(chalk.cyan(`  • Slides with global scaling: ${this.stats.slidesWithGlobalScaling}`));
    console.log(chalk.cyan(`  • Iterations completed: ${this.stats.iterations}/${this.config.maxIter}`));
    
    const successRate = ((this.stats.totalSlides - 
                         (this.stats.slidesSplit + this.stats.slidesWithLocalScaling + 
                          this.stats.slidesWithGlobalScaling)) / this.stats.totalSlides) * 100;
    
    console.log(chalk.green(`  • Success rate: ${Math.round(successRate)}% of slides required no modification`));
  }
}
