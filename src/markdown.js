/**
 * Markdownパーサー・AST操作・分割ロジック
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { SPLITTABLE_NODES, SENTENCE_ENDINGS } from './config.js';

/**
 * MarkdownをASTに変換
 */
export async function parseMarkdown(content) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm);

  return processor.parse(content);
}

/**
 * ASTをMarkdownに変換
 */
export async function stringifyAST(ast) {
  const processor = unified()
    .use(remarkStringify, {
      bullet: '-',
      fence: '`',
      fences: true,
      incrementListMarker: false
    })
    .use(remarkFrontmatter)
    .use(remarkGfm);

  return processor.stringify(ast);
}

/**
 * ASTからスライド単位に分割
 */
export function extractSlides(ast) {
  const slides = [];
  let currentSlide = {
    frontmatter: null,
    content: []
  };

  // front-matterと本文を分離
  for (const node of ast.children) {
    if (node.type === 'yaml' || node.type === 'toml') {
      currentSlide.frontmatter = node;
    } else if (node.type === 'thematicBreak') {
      // スライド区切り（---）を検出
      if (currentSlide.content.length > 0) {
        slides.push({ ...currentSlide });
        currentSlide = { frontmatter: null, content: [] };
      }
    } else {
      currentSlide.content.push(node);
    }
  }

  // 最後のスライドを追加
  if (currentSlide.content.length > 0) {
    slides.push(currentSlide);
  }

  return slides;
}

/**
 * スライド配列をASTに再構成
 */
export function reconstructAST(slides) {
  const children = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    
    // 最初のスライドの場合、front-matterを追加
    if (i === 0 && slide.frontmatter) {
      children.push(slide.frontmatter);
    }

    // スライドコンテンツを追加
    children.push(...slide.content);

    // 最後のスライド以外は区切りを追加
    if (i < slides.length - 1) {
      children.push({
        type: 'thematicBreak'
      });
    }
  }

  return {
    type: 'root',
    children
  };
}

/**
 * スライドの複雑度を推定
 */
export function estimateComplexity(slideContent) {
  let textLength = 0;
  let listItemCount = 0;
  let hasTable = false;
  let hasCodeBlock = false;
  let hasImage = false;

  visit({ type: 'root', children: slideContent }, (node) => {
    switch (node.type) {
      case 'text':
        textLength += node.value.length;
        break;
      case 'listItem':
        listItemCount++;
        break;
      case 'table':
        hasTable = true;
        break;
      case 'code':
        hasCodeBlock = true;
        textLength += node.value.length * 0.5; // コードは通常小さいフォントで表示
        break;
      case 'image':
        hasImage = true;
        break;
    }
  });

  return {
    textLength,
    listItemCount,
    hasTable,
    hasCodeBlock,
    hasImage,
    complexity: textLength + (listItemCount * 50) + (hasTable ? 200 : 0) + 
                (hasCodeBlock ? 100 : 0) + (hasImage ? 150 : 0)
  };
}

/**
 * 段落を文末記号で分割
 */
function splitParagraphAtSentence(paragraphNode, maxChars) {
  if (paragraphNode.type !== 'paragraph') return [paragraphNode];

  const text = getTextFromNode(paragraphNode);
  if (text.length <= maxChars) return [paragraphNode];

  // 文末記号を探す
  const midpoint = text.length / 2;
  let bestSplit = -1;
  let bestDistance = Infinity;

  for (let i = Math.floor(midpoint * 0.3); i < Math.floor(midpoint * 1.7); i++) {
    const char = text[i];
    if (SENTENCE_ENDINGS.includes(char)) {
      const distance = Math.abs(i - midpoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSplit = i + 1; // 文末記号の次から分割
      }
    }
  }

  if (bestSplit === -1) return [paragraphNode]; // 分割点が見つからない

  // テキストノードを分割
  const firstPart = text.substring(0, bestSplit).trim();
  const secondPart = text.substring(bestSplit).trim();

  if (!firstPart || !secondPart) return [paragraphNode];

  return [
    {
      type: 'paragraph',
      children: [{ type: 'text', value: firstPart }]
    },
    {
      type: 'paragraph',
      children: [{ type: 'text', value: secondPart }]
    }
  ];
}

/**
 * リストを中央付近で分割
 */
function splitListAtMidpoint(listNode, maxItems) {
  if (listNode.type !== 'list') return [listNode];
  if (listNode.children.length <= maxItems) return [listNode];

  const midpoint = Math.floor(listNode.children.length / 2);
  const firstHalf = listNode.children.slice(0, midpoint);
  const secondHalf = listNode.children.slice(midpoint);

  return [
    {
      ...listNode,
      children: firstHalf
    },
    {
      ...listNode,
      children: secondHalf
    }
  ];
}

/**
 * スライドを分割
 */
export function splitSlide(slideContent, config) {
  const newSlides = [];
  let currentSlide = [];
  let needsSplit = false;

  for (let i = 0; i < slideContent.length; i++) {
    const node = slideContent[i];
    
    // 段落の分割チェック
    if (node.type === 'paragraph') {
      const text = getTextFromNode(node);
      if (text.length > config.paragraphMaxChars) {
        const splitParagraphs = splitParagraphAtSentence(node, config.paragraphMaxChars);
        if (splitParagraphs.length > 1) {
          currentSlide.push(splitParagraphs[0]);
          newSlides.push([...currentSlide]);
          currentSlide = [];
          
          // 残りの段落を処理
          for (let j = 1; j < splitParagraphs.length; j++) {
            if (j === splitParagraphs.length - 1) {
              currentSlide.push(splitParagraphs[j]);
            } else {
              newSlides.push([splitParagraphs[j]]);
            }
          }
          needsSplit = true;
          continue;
        }
      }
    }

    // リストの分割チェック
    if (node.type === 'list') {
      if (node.children.length > config.listMaxItems) {
        const splitLists = splitListAtMidpoint(node, config.listMaxItems);
        if (splitLists.length > 1) {
          currentSlide.push(splitLists[0]);
          newSlides.push([...currentSlide]);
          currentSlide = [splitLists[1]];
          needsSplit = true;
          continue;
        }
      }
    }

    // 見出しによる分割チェック（後続にブロックが多い場合）
    if (node.type === 'heading') {
      const complexity = estimateComplexity(slideContent.slice(i));
      if (complexity.complexity > 800 && currentSlide.length > 0) {
        newSlides.push([...currentSlide]);
        currentSlide = [node];
        needsSplit = true;
        continue;
      }
    }

    currentSlide.push(node);
  }

  // 最後のスライドを追加
  if (currentSlide.length > 0) {
    newSlides.push(currentSlide);
  }

  return needsSplit ? newSlides : [slideContent];
}

/**
 * ノードからテキストを抽出
 */
function getTextFromNode(node) {
  let text = '';
  
  visit(node, 'text', (textNode) => {
    text += textNode.value;
  });

  return text;
}

/**
 * スライドにスタイルクラスを適用
 */
export function addStyleClass(slideContent, className) {
  return slideContent.map(node => {
    if (node.type === 'heading' || node.type === 'paragraph' || 
        node.type === 'list' || node.type === 'blockquote') {
      return {
        ...node,
        data: {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            className: [className]
          }
        }
      };
    }
    return node;
  });
}

/**
 * front-matterを更新
 */
export function updateFrontmatter(frontmatterNode, newStyle) {
  if (!frontmatterNode || frontmatterNode.type !== 'yaml') {
    return {
      type: 'yaml',
      value: `style: |\n  ${newStyle}`
    };
  }

  const lines = frontmatterNode.value.split('\n');
  let styleLineIndex = -1;
  let inStyleSection = false;

  // 既存のstyleセクションを探す
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('style:')) {
      styleLineIndex = i;
      inStyleSection = true;
      break;
    }
  }

  if (styleLineIndex === -1) {
    // styleセクションが存在しない場合、追加
    lines.push('style: |');
    lines.push(`  ${newStyle}`);
  } else {
    // 既存のstyleセクションに追加
    lines.splice(styleLineIndex + 1, 0, `  ${newStyle}`);
  }

  return {
    ...frontmatterNode,
    value: lines.join('\n')
  };
}
