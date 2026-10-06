/** Central runtime settings (UI-bound). */
export interface Settings {
  tickMs: number;
  gridSize: number;
  confidenceThreshold: number;
  everyNTicks: number;
  useTrapCheck: boolean;
  /** Which gateway evaluation model powers the AI modes. */
  aiModel: 'jev' | 'laya';
}

export const DEFAULT_SETTINGS: Settings = {
  tickMs: 150,
  gridSize: 20,
  confidenceThreshold: 0.6,
  everyNTicks: 3,
  useTrapCheck: true,
  aiModel: 'jev',
};

export const HIGHSCORE_KEY = 'snakejev.highscore.v1';
export const SETTINGS_KEY = 'snakejev.settings.v1';

export function loadHighScore(): number {
  try {
    return Number(localStorage.getItem(HIGHSCORE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(v: number): void {
  try {
    localStorage.setItem(HIGHSCORE_KEY, String(v));
  } catch {
    /* private mode */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Estimated Jev cost: $0.042 / 1M input tokens (model page, input-only billing). */
export const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
