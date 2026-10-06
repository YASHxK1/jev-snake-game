import { createGame, step, type StepResult } from '../core/game.ts';
import type { ControllerKind, Direction, GamePhase, GameState } from '../core/types.ts';
import { mulberry32, type Rng } from '../core/rng.ts';
import { JevController } from '../controllers/jev.ts';
import { Renderer } from '../render/renderer.ts';
import { DEFAULT_SETTINGS, loadHighScore, loadSettings, saveHighScore, saveSettings, type Settings } from '../config.ts';
import { emptyStats, renderDebug, renderStats, type StatsMap } from './panels.ts';
import { toast } from './toast.ts';
import type { Controller } from '../controllers/controller.ts';

function snapshot(s: GameState): GameState {
  return { ...s, body: s.body.map((c) => ({ ...c })), food: { ...s.food } };
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

export class App {
  private state: GameState;
  private phase: GamePhase = 'menu';
  private settings: Settings = { ...DEFAULT_SETTINGS, ...loadSettings() };
  private rng: Rng;
  private renderer: Renderer;
  private jev: JevController;
  private mode: ControllerKind = 'jev';
  private desiredDir: Direction = 'RIGHT';
  private acc = 0;
  private lastT = 0;
  private high = loadHighScore();
  private stats: StatsMap = emptyStats();
  private announcedFallback = false;

  constructor() {
    this.rng = mulberry32(Date.now() % 2 ** 31);
    this.state = createGame({ width: this.settings.gridSize, height: this.settings.gridSize, tickMs: this.settings.tickMs, seed: (Math.random() * 2 ** 31) | 0 });
    this.renderer = new Renderer($<HTMLCanvasElement>('board'));
    this.jev = new JevController({
      confidenceThreshold: this.settings.confidenceThreshold,
      aiModel: this.settings.aiModel,
      everyNTicks: this.settings.everyNTicks,
      useTrapCheck: true,
      onDebug: (d) => {
        renderDebug($('debug-body'), d);
        $('dbg-calls').textContent = String(d.calls);
        $('dbg-cost').textContent = `$${d.estCostUsd.toFixed(6)}`;
        if (d.fallbacks > 0 && !this.announcedFallback) {
          this.announcedFallback = true;
          toast(`${d.model === 'laya' ? 'Laya' : 'Jev'} unreachable, using fallback bot`);
        }
      },
    });
    this.mode = this.settings.aiModel;
    this.jev.setModel(this.mode);
    this.bindUI();
    this.applySettingsToInputs();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.setPhase('paused');
    });
    this.loop = this.loop.bind(this);
  }

  start(): void {
    this.setPhase('menu');
    requestAnimationFrame(this.loop);
  }

  // ---- setup -------------------------------------------------------------

  private get controller(): Controller {
    return this.jev;
  }

  private newGame(): void {
    const seed = (Math.random() * 2 ** 31) | 0;
    this.rng = mulberry32(seed);
    this.state = createGame({
      width: this.settings.gridSize,
      height: this.settings.gridSize,
      tickMs: this.settings.tickMs,
      seed,
    });
    this.desiredDir = 'RIGHT';
    this.jev.reset();
    this.announcedFallback = false;
    this.acc = 0;
  }

  private setPhase(p: GamePhase): void {
    this.phase = p;
    $('phase').textContent = p.toUpperCase();
    $('menu').classList.toggle('hidden', p !== 'menu');
    $('gameover').classList.toggle('hidden', p !== 'gameover' && p !== 'win');
    $('btn-resume').classList.toggle('hidden', p !== 'paused');
    $('paused-badge').classList.toggle('hidden', p !== 'paused');
    if (p === 'gameover' || p === 'win') {
      $('final-score').textContent = String(this.state.score);
      $('final-best').textContent = String(this.high);
      $('final-title').textContent = p === 'win' ? 'You filled the board!' : 'Game Over';
    }
  }

  // ---- main loop: fixed timestep + accumulator, render every rAF --------

  private loop(t: number): void {
    requestAnimationFrame(this.loop);
    if (this.lastT === 0) this.lastT = t;
    const dt = Math.min(250, t - this.lastT); // clamp tab-switch jumps
    this.lastT = t;
    if (this.phase === 'playing') {
      this.acc += dt;
      const tick = this.settings.tickMs;
      let guard = 0;
      while (this.acc >= tick && guard++ < 8) {
        this.acc -= tick;
        void this.doTick();
        if (this.phase !== 'playing') {
          this.acc = 0;
          break;
        }
        // doTick is async (AI-driven): refresh `desiredDir` in the background
        // without blocking; one tick per frame max keeps AI timing predictable.
        break; // remainder accrues
      }
      if (guard >= 8) this.acc = 0;
    }
    this.renderer.draw(this.state);
  }

  private async doTick(): Promise<void> {
    const c = this.controller;
    c.onTick?.(this.state);
    // Non-blocking: refresh cache in background; step with last known direction.
    void c
      .decide(snapshot(this.state))
      .then((d) => {
        this.desiredDir = d;
        $('ai-active').textContent = this.jev.model.toUpperCase();
      })
      .catch(() => undefined);
    const res: StepResult = step(this.state, this.desiredDir, this.rng);
    void res;
    $('score').textContent = String(this.state.score);
    if (this.state.score > this.high) {
      this.high = this.state.score;
      saveHighScore(this.high);
      $('high').textContent = String(this.high);
    }
    if (!this.state.alive || this.state.won) this.endGame();
  }

  private endGame(): void {
    const s = this.stats[this.mode];
    s.games += 1;
    s.totalScore += this.state.score;
    s.best = Math.max(s.best, this.state.score);
    s.totalTicks += this.state.steps;
    renderStats($('stats-body'), this.stats);
    this.setPhase(this.state.won ? 'win' : 'gameover');
  }

  // ---- UI -----------------------------------------------------------------

  private bindUI(): void {
    $('high').textContent = String(this.high);
    renderStats($('stats-body'), this.stats);

    const setMode = (m: ControllerKind) => {
      this.mode = m;
      for (const k of ['jev', 'laya'] as const) {
        $(`mode-${k}`).classList.toggle('active', k === m);
      }
      this.settings.aiModel = m;
      this.jev.setModel(m);
      saveSettings(this.settings);
      $('ai-active').textContent = '';
      toast(m === 'jev' ? 'Jev driving (fallback: BFS bot)' : 'Laya driving (fallback: BFS bot)');
    };
    $('mode-jev').addEventListener('click', () => setMode('jev'));
    $('mode-laya').addEventListener('click', () => setMode('laya'));
    for (const k of ['jev', 'laya'] as const) {
      $(`mode-${k}`).classList.toggle('active', k === this.mode);
    }

    $('btn-start').addEventListener('click', () => {
      this.newGame();
      this.setPhase('playing');
    });
    $('btn-restart').addEventListener('click', () => {
      this.newGame();
      this.setPhase('playing');
    });
    $('btn-resume').addEventListener('click', () => this.setPhase('playing'));
    $('btn-pause').addEventListener('click', () => {
      if (this.phase === 'playing') this.setPhase('paused');
      else if (this.phase === 'paused') this.setPhase('playing');
    });

    // Settings
    const s = this.settings;
    const num = (id: string, get: () => number, set: (v: number) => void) => {
      $(id).addEventListener('change', (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(v)) {
          set(v);
          saveSettings(this.settings);
        }
      });
      void get;
    };
    num('set-tick', () => s.tickMs, (v) => (s.tickMs = Math.min(1000, Math.max(40, v))));
    num('set-grid', () => s.gridSize, (v) => {
      s.gridSize = Math.min(40, Math.max(8, Math.round(v)));
      this.newGame();
      this.resize();
      this.setPhase('menu');
    });
    num('set-conf', () => s.confidenceThreshold, (v) => {
      s.confidenceThreshold = Math.min(1, Math.max(0, v));
      this.jev.setOptions({ confidenceThreshold: s.confidenceThreshold });
    });
    num('set-everyn', () => s.everyNTicks, (v) => {
      s.everyNTicks = Math.min(20, Math.max(1, Math.round(v)));
      this.jev.setOptions({ everyNTicks: s.everyNTicks });
    });
    $('set-trap').addEventListener('change', (e) => {
      s.useTrapCheck = (e.target as HTMLInputElement).checked;
      this.jev.setOptions({ useTrapCheck: s.useTrapCheck });
      saveSettings(this.settings);
    });

    // Keyboard: Space/P pause, Enter start/restart only.
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (this.phase === 'playing') this.setPhase('paused');
        else if (this.phase === 'paused') this.setPhase('playing');
        else if (this.phase === 'menu') {
          this.newGame();
          this.setPhase('playing');
        }
      } else if (e.key === 'Enter') {
        if (this.phase !== 'playing') {
          this.newGame();
          this.setPhase('playing');
        }
      }
    });
  }

  private applySettingsToInputs(): void {
    ( $('set-tick') as HTMLInputElement).value = String(this.settings.tickMs);
    ($('set-grid') as HTMLInputElement).value = String(this.settings.gridSize);
    ($('set-conf') as HTMLInputElement).value = String(this.settings.confidenceThreshold);
    ($('set-everyn') as HTMLInputElement).value = String(this.settings.everyNTicks);
    ($('set-trap') as HTMLInputElement).checked = this.settings.useTrapCheck;
  }

  private resize(): void {
    const wrap = $('board-wrap');
    const avail = Math.min(wrap.clientWidth || 480, 520, window.innerHeight * 0.62);
    this.renderer.resize(Math.max(240, Math.floor(avail)), this.settings.gridSize);
  }
}
