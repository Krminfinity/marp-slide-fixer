/**
 * 設定ファイルローダー
 * 優先順位: CLI --config 指定 > slide-fixer.config.(json|mjs|cjs) 自動探索 > デフォルト
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';
import { createConfig } from './config.js';

const CANDIDATE_NAMES = [
  'slide-fixer.config.json',
  'slide-fixer.config.mjs',
  'slide-fixer.config.cjs'
];

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function loadJson(p) {
  const raw = await fs.readFile(p, 'utf-8');
  return JSON.parse(raw);
}

async function loadModule(p) {
  const mod = await import(pathToFileURL(p));
  return mod.default || mod.config || {};
}

export async function resolveConfigFile(explicitPath) {
  if (explicitPath) {
    const abs = path.isAbsolute(explicitPath) ? explicitPath : path.join(process.cwd(), explicitPath);
    if (!await fileExists(abs)) throw new Error(`Config file not found: ${explicitPath}`);
    return abs;
  }
  for (const name of CANDIDATE_NAMES) {
    const candidate = path.join(process.cwd(), name);
    if (await fileExists(candidate)) return candidate;
  }
  return null; // 見つからない
}

export async function loadMergedConfig(cliOptions) {
  const { configPath } = cliOptions;
  let fileConfig = {};
  let usedFile = null;
  try {
    const resolved = await resolveConfigFile(configPath);
    if (resolved) {
      usedFile = resolved;
      if (resolved.endsWith('.json')) fileConfig = await loadJson(resolved);
      else fileConfig = await loadModule(resolved);
    }
  } catch (e) {
    throw new Error(`Config load error: ${e.message}`);
  }

  // CLIからの明示上書き (undefinedは無視)
  const overrides = {};
  const map = [
    ['maxIter', 'maxIter', v => parseInt(v, 10)],
    ['listMaxItems', 'listMaxItems', v => parseInt(v, 10)],
    ['paragraphMaxChars', 'paragraphMaxChars', v => parseInt(v, 10)],
    ['fontStep', 'fontStep', v => parseFloat(v)],
    ['fontMin', 'fontMin', v => parseFloat(v)],
    ['logLevel', 'logLevel', v => v]
  ];
  for (const [cliKey, cfgKey, conv] of map) {
    if (cliOptions[cliKey] !== undefined && cliOptions[cliKey] !== null) {
      overrides[cfgKey] = conv(cliOptions[cliKey]);
    }
  }

  const merged = createConfig({ ...fileConfig, ...overrides });
  return { config: merged, configFile: usedFile };
}
