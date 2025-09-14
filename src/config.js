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
 * 設定オブジェクト作成ヘルパー
 */
export function createConfig(options = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...options
  };
}
