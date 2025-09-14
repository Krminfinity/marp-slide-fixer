/**
 * デフォルト設定とCLIオプション定義
 */

export const DEFAULT_CONFIG = {
  // 分割しきい値
  listMaxItems: 10,
  paragraphMaxChars: 600,
  
  // 縮小設定
  fontStep: 0.95,
  fontMin: 0.7,
  
  // 制御設定
  maxIter: 3,
  
  // 一時ファイル設定
  tempDir: '.marp-slide-fixer-temp',
  
  // Puppeteer設定
  viewport: {
    width: 1920,
    height: 1080
  },
  
  // ログレベル
  logLevel: 'info' // 'debug', 'info', 'warn', 'error'
};

/**
 * 分割可能なノードタイプ
 */
export const SPLITTABLE_NODES = [
  'paragraph',
  'list',
  'heading'
];

/**
 * 縮小対象のノードタイプとスタイル定義
 */
export const SCALING_STYLES = {
  code: 'pre code { font-size: 0.85em; white-space: pre-wrap; }',
  table: 'table { table-layout: fixed; width: 100%; } th, td { overflow: hidden; text-overflow: ellipsis; }',
  image: 'img { max-width: 100%; height: auto; }',
  generic: (fontSize) => `.slide-scaled { font-size: ${fontSize}em; }`
};

/**
 * 句読点・文末記号の定義
 */
export const SENTENCE_ENDINGS = [
  '。', '.', '!', '?', '！', '？'
];

/**
 * CLIオプション定義
 */
export const CLI_OPTIONS = [
  {
    flags: '--in <input>',
    description: '入力Markdownファイルパス',
    required: true
  },
  {
    flags: '--out <output>',
    description: '出力Markdownファイルパス',
    required: true
  },
  {
    flags: '--max-iter <number>',
    description: `最大反復回数 (デフォルト: ${DEFAULT_CONFIG.maxIter})`,
    defaultValue: DEFAULT_CONFIG.maxIter,
    parseAs: 'int'
  },
  {
    flags: '--list-max-items <number>',
    description: `リスト項目分割しきい値 (デフォルト: ${DEFAULT_CONFIG.listMaxItems})`,
    defaultValue: DEFAULT_CONFIG.listMaxItems,
    parseAs: 'int'
  },
  {
    flags: '--paragraph-max-chars <number>',
    description: `段落文字数分割しきい値 (デフォルト: ${DEFAULT_CONFIG.paragraphMaxChars})`,
    defaultValue: DEFAULT_CONFIG.paragraphMaxChars,
    parseAs: 'int'
  },
  {
    flags: '--font-step <number>',
    description: `フォント縮小ステップ (デフォルト: ${DEFAULT_CONFIG.fontStep})`,
    defaultValue: DEFAULT_CONFIG.fontStep,
    parseAs: 'float'
  },
  {
    flags: '--font-min <number>',
    description: `フォント最小サイズ (デフォルト: ${DEFAULT_CONFIG.fontMin})`,
    defaultValue: DEFAULT_CONFIG.fontMin,
    parseAs: 'float'
  },
  {
    flags: '--log-level <level>',
    description: `ログレベル (debug|info|warn|error) (デフォルト: ${DEFAULT_CONFIG.logLevel})`,
    defaultValue: DEFAULT_CONFIG.logLevel
  }
];

/**
 * 設定オブジェクト作成ヘルパー
 */
export function createConfig(options = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...options
  };
}
