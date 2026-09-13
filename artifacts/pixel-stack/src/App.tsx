import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pause, Play, RotateCcw, Volume2, VolumeX, Flame, MousePointer2, ArrowUp, Crosshair } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

declare const Phaser: any;

const queryClient = new QueryClient();

type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

type GameCallbacks = {
  onScore: (score: number) => void;
  onState: (state: GameState) => void;
  onMessage: (message: string) => void;
};

type Piece = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number;
  color: number;
  rotation: number;
};

const COLORS = [0x55f2c6, 0xff5f52, 0xffcf5a, 0x8292ff, 0xf06cff];

class PixelStackScene extends Phaser.Scene {
  private callbacks: GameCallbacks;
  private graphics!: any;
  private sparks: Array<{ x: number; y: number; size: number; speed: number; alpha: number }> = [];
  private tower: Piece[] = [];
  private active: Piece | null = null;
  private dragging = false;
  private dragMoved = false;
  private dragOffset = { x: 0, y: 0 };
  private lavaTop = 621;
  private lavaPausedUntil = 0;
  private contactPulseUntil = 0;
  private score = 0;
  private gameState: GameState = 'ready';
  private lastTime = 0;
  private spawnIndex = 0;
  private gameOverTimer?: any;

  constructor(callbacks: GameCallbacks) {
    super('PixelStack');
    this.callbacks = callbacks;
  }

  create() {
    this.graphics = this.add.graphics();
    this.input.on('pointerdown', (pointer: any) => this.pointerDown(pointer));
    this.input.on('pointermove', (pointer: any) => this.pointerMove(pointer));
    this.input.on('pointerup', () => this.pointerUp());
    this.input.on('pointerout', () => this.pointerUp());

    for (let index = 0; index < 54; index += 1) {
      this.sparks.push({
        x: Phaser.Math.Between(24, 396),
        y: Phaser.Math.Between(52, 625),
        size: Phaser.Math.FloatBetween(0.6, 2.2),
        speed: Phaser.Math.FloatBetween(2, 8),
        alpha: Phaser.Math.FloatBetween(0.16, 0.68),
      });
    }
    this.reset('ready');
  }

  reset(nextState: GameState = 'ready') {
    if (this.gameOverTimer) {
      window.clearTimeout(this.gameOverTimer);
    }
    this.tower = [];
    this.active = null;
    this.dragging = false;
    this.dragMoved = false;
    this.lavaTop = 621;
    this.lavaPausedUntil = 0;
    this.contactPulseUntil = 0;
    this.score = 0;
    this.spawnIndex = 0;
    this.lastTime = 0;
    this.setState(nextState);
    this.callbacks.onScore(0);
    this.callbacks.onMessage(nextState === 'ready' ? 'TAP THE LOWER FIELD TO DROP IN' : 'NEW RUN · BUILD UPWARD');
  }

  startRun() {
    if (this.gameState === 'ready') {
      this.setState('playing');
      this.callbacks.onMessage('DRAG THE PILLAR UP · RELEASE TO LOCK');
    }
  }

  togglePause() {
    if (this.gameState === 'gameover' || this.gameState === 'ready') return;
    if (this.gameState === 'paused') {
      this.setState('playing');
      this.callbacks.onMessage('LAVA IS MOVING · KEEP BUILDING');
    } else {
      this.setState('paused');
      this.callbacks.onMessage('RUN FROZEN · RESUME WHEN READY');
    }
  }

  private setState(state: GameState) {
    this.gameState = state;
    this.callbacks.onState(state);
  }

  private pointerDown(pointer: any) {
    if (this.gameState === 'paused' || this.gameState === 'gameover') return;
    const x = Phaser.Math.Clamp(pointer.x, 28, 392);
    const y = Phaser.Math.Clamp(pointer.y, 42, 648);

    if (this.active) {
      const dx = Math.abs(pointer.x - this.active.x);
      const dy = Math.abs(pointer.y - this.active.y);
      if (dx < this.active.w && dy < this.active.h + 18) {
        this.dragging = true;
        this.dragMoved = false;
        this.dragOffset = { x: pointer.x - this.active.x, y: pointer.y - this.active.y };
      }
      return;
    }

    if (y > this.lavaTop - 90) {
      this.startRun();
      this.spawnPiece(x);
      this.dragging = true;
      this.dragMoved = false;
      this.dragOffset = { x: 0, y: 0 };
    } else if (this.gameState === 'ready') {
      this.startRun();
    }
  }

  private pointerMove(pointer: any) {
    if (!this.dragging || !this.active || this.gameState !== 'playing') return;
    const piece = this.active;
    this.dragMoved = true;
    piece.x = Phaser.Math.Clamp(pointer.x - this.dragOffset.x, 34 + piece.w / 2, 386 - piece.w / 2);
    piece.y = Phaser.Math.Clamp(pointer.y - this.dragOffset.y, 88 + piece.h / 2, this.lavaTop - piece.h / 2 - 10);
    this.callbacks.onMessage(piece.y < 180 ? 'CEILING LOCK ZONE' : 'RELEASE TO ANCHOR');
  }

  private pointerUp() {
    if (!this.dragging || !this.active || this.gameState !== 'playing') return;
    this.dragging = false;
    if (!this.dragMoved) {
      this.callbacks.onMessage('PIECE READY · DRAG UP TO AIM');
      return;
    }
    this.anchorPiece();
  }

  private spawnPiece(x: number) {
    const kind = this.spawnIndex % 5;
    this.spawnIndex += 1;
    const dimensions = [
      { w: 74, h: 26 },
      { w: 44, h: 44 },
      { w: 84, h: 22 },
      { w: 34, h: 62 },
      { w: 60, h: 34 },
    ][kind];
    this.active = {
      x,
      y: this.lavaTop - 54,
      ...dimensions,
      kind,
      color: COLORS[kind],
      rotation: kind === 1 ? 45 : kind === 4 ? -12 : 0,
    };
    this.callbacks.onMessage('DRAG THE PILLAR UP · RELEASE TO LOCK');
  }

  private anchorPiece() {
    if (!this.active) return;
    const piece = this.active;
    const towerBottom = this.tower.length
      ? Math.max(...this.tower.map((item) => item.y + item.h / 2))
      : 86;
    const targetY = this.tower.length ? towerBottom + piece.h / 2 + 5 : 86 + piece.h / 2;
    piece.y = Math.min(Math.max(piece.y, 86 + piece.h / 2), targetY);
    this.tower.push(piece);
    this.active = null;

    this.score += 10 + Math.min(this.tower.length, 8);
    this.callbacks.onScore(this.score);
    this.callbacks.onMessage(this.tower.length === 1 ? 'FIRST ANCHOR · KEEP IT TIGHT' : 'LOCKED · THE LAVA IS RISING');
    this.lavaTop -= 7 + Math.min(this.tower.length, 4);
    this.contactPulseUntil = this.time.now + 420;

    const newBottom = Math.max(...this.tower.map((item) => item.y + item.h / 2));
    if (newBottom >= this.lavaTop - 7) {
      this.lavaPausedUntil = this.time.now + 1000;
      this.contactPulseUntil = this.time.now + 1000;
      this.callbacks.onMessage('LAVA CONTACT · ONE MORE SECOND');
      this.gameOverTimer = window.setTimeout(() => {
        if (this.gameState === 'playing' && this.tower.length) this.endRun();
      }, 960);
    }
  }

  private endRun() {
    this.setState('gameover');
    this.callbacks.onMessage('THE STACK COLLAPSED · TRY A NEW LINE');
  }

  update(time: number, delta: number) {
    if (!this.graphics) return;
    const elapsed = this.lastTime ? Math.min(delta, 40) : 16;
    this.lastTime = time;
    if (this.gameState === 'playing' && time > this.lavaPausedUntil) {
      this.lavaTop -= elapsed * 0.008;
      const bottom = this.tower.length ? Math.max(...this.tower.map((item) => item.y + item.h / 2)) : 0;
      if (bottom > this.lavaTop + 5) this.endRun();
    }
    for (const spark of this.sparks) {
      spark.y -= (spark.speed * elapsed) / 1000;
      if (spark.y < 42) spark.y = 624;
    }
    this.draw(time);
  }

  private draw(time: number) {
    const g = this.graphics;
    g.clear();

    // Deep violet playfield and subtle technical grid.
    g.fillStyle(0x130f28, 1);
    g.fillRect(0, 0, 420, 720);
    g.fillStyle(0x1b1640, 0.56);
    g.fillRect(16, 46, 388, 592);
    g.lineStyle(1, 0x463a72, 0.18);
    for (let x = 28; x < 405; x += 32) g.lineBetween(x, 60, x, 636);
    for (let y = 76; y < 638; y += 32) g.lineBetween(20, y, 400, y);

    // Ambient particles.
    for (const spark of this.sparks) {
      g.fillStyle(0xaea9ff, spark.alpha);
      g.fillCircle(spark.x, spark.y, spark.size);
    }

    // Ceiling rail and lock zone.
    g.fillStyle(0x4d4580, 0.44);
    g.fillRect(22, 76, 376, 2);
    g.fillStyle(0x55f2c6, 0.75);
    g.fillRect(22, 76, 72, 2);
    g.fillStyle(0x55f2c6, 0.12);
    g.fillRect(22, 79, 376, 88);
    g.lineStyle(1, 0x55f2c6, 0.22);
    g.strokeRect(22, 79, 376, 88);

    // Vertical guide line.
    g.lineStyle(1, 0x8292ff, 0.22);
    g.lineBetween(210, 98, 210, this.lavaTop - 9);

    // Tower shadows and anchors.
    for (const piece of this.tower) this.drawPiece(piece, false);
    if (this.active) {
      const ghost = { ...this.active, y: this.tower.length ? Math.max(...this.tower.map((item) => item.y + item.h / 2)) + this.active.h / 2 + 5 : 86 + this.active.h / 2 };
      if (ghost.y < this.lavaTop - 4) this.drawPiece(ghost, true, 0.18);
      this.drawPiece(this.active, true, 1);
      g.lineStyle(1, this.active.color, 0.45);
      g.lineBetween(this.active.x, this.active.y + this.active.h / 2 + 12, this.active.x, this.lavaTop - 7);
    }

    // Lava body and animated surface.
    const contact = time < this.contactPulseUntil;
    const surface = this.lavaTop + Math.sin(time / 240) * 3;
    g.fillStyle(contact ? 0xffcf5a : 0xff5f52, 0.96);
    g.beginPath();
    g.moveTo(0, surface);
    for (let x = 0; x <= 420; x += 14) {
      g.lineTo(x, this.lavaTop + Math.sin(time / 230 + x / 26) * (contact ? 6 : 3));
    }
    g.lineTo(420, 720);
    g.lineTo(0, 720);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xffcf5a, contact ? 0.92 : 0.55);
    for (let x = 0; x < 420; x += 20) {
      g.fillRect(x, this.lavaTop - 2 + Math.sin(time / 160 + x) * 2, 11, 3);
    }
    g.fillStyle(0x7d214b, 0.4);
    g.fillRect(0, this.lavaTop + 22, 420, 8);

    if (this.gameState === 'paused') {
      g.fillStyle(0x130f28, 0.56);
      g.fillRect(16, 46, 388, 592);
    }
  }

  private drawPiece(piece: Piece, active: boolean, alpha = 1) {
    const g = this.graphics;
    const color = piece.color;
    const x = piece.x - piece.w / 2;
    const y = piece.y - piece.h / 2;
    g.save();
    g.translateCanvas(piece.x, piece.y);
    g.rotateCanvas((piece.rotation * Math.PI) / 180);
    g.fillStyle(0x0a0819, alpha * 0.7);
    g.fillRect(-piece.w / 2 + 4, -piece.h / 2 + 6, piece.w, piece.h);
    g.fillStyle(color, alpha);
    g.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    g.fillStyle(0xffffff, alpha * 0.22);
    g.fillRect(-piece.w / 2, -piece.h / 2, piece.w, 4);
    g.fillStyle(0x130f28, alpha * 0.24);
    g.fillRect(-piece.w / 2 + 7, -piece.h / 2 + 8, Math.max(piece.w - 18, 4), 3);
    g.lineStyle(active ? 2 : 1, active ? 0xffffff : color, alpha * (active ? 0.84 : 0.42));
    g.strokeRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    if (active) {
      g.lineStyle(1, 0xffffff, 0.34);
      g.strokeRect(-piece.w / 2 - 4, -piece.h / 2 - 4, piece.w + 8, piece.h + 8);
    }
    g.restore();
  }
}

function GameCanvas({ callbacks, paused }: { callbacks: GameCallbacks; paused: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);

  useEffect(() => {
    if (!hostRef.current || typeof Phaser === 'undefined') return;
    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 420,
      height: 720,
      parent: hostRef.current,
      transparent: false,
      backgroundColor: '#130f28',
      render: { antialias: true, pixelArt: false, roundPixels: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: new PixelStackScene(callbacks),
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [callbacks]);

  useEffect(() => {
    const scene = gameRef.current?.scene?.getScene('PixelStack') as PixelStackScene | undefined;
    if (scene && scene['gameState'] !== 'gameover' && scene['gameState'] !== 'ready') {
      scene.togglePause();
    }
  }, [paused]);

  return <div ref={hostRef} className="game-canvas" data-testid="game-surface" />;
}

function Home() {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(window.localStorage.getItem('pixel-stack-best') || 0));
  const [gameState, setGameState] = useState<GameState>('ready');
  const [message, setMessage] = useState('TAP THE LOWER FIELD TO DROP IN');
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [runKey, setRunKey] = useState(0);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      window.localStorage.setItem('pixel-stack-best', String(score));
    }
  }, [score, best]);

  const callbacks = useMemo<GameCallbacks>(() => ({
    onScore: setScore,
    onState: (state) => {
      setGameState(state);
      if (state === 'paused') setPaused(true);
      if (state === 'playing') setPaused(false);
    },
    onMessage: setMessage,
  }), []);

  const restart = () => {
    setScore(0);
    setPaused(false);
    setGameState('ready');
    setMessage('TAP THE LOWER FIELD TO DROP IN');
    setRunKey((value) => value + 1);
  };

  return (
    <main className="pixel-app">
      <div className="scanlines" aria-hidden="true" />
      <section className="game-shell">
        <header className="topbar">
          <div className="brand-lockup" data-testid="text-brand">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <div>
              <p className="brand-name">PIXEL STACK</p>
              <p className="brand-subtitle">VERTICAL PRESSURE TEST</p>
            </div>
          </div>
          <div className="header-actions">
            <div className="status-chip" data-testid="status-game-state">
              <span className={`status-dot ${gameState}`} />
              {gameState === 'gameover' ? 'RUN ENDED' : gameState === 'paused' ? 'PAUSED' : gameState === 'ready' ? 'STANDBY' : 'LIVE RUN'}
            </div>
            <button className="icon-button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? 'Mute game' : 'Enable sound'} data-testid="button-toggle-sound">
              {soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
          </div>
        </header>

        <div className="score-strip">
          <div className="stat-block">
            <span className="stat-label">SCORE</span>
            <strong className="stat-value" data-testid="text-score">{String(score).padStart(4, '0')}</strong>
          </div>
          <div className="pressure-meter" aria-label="Rising lava indicator">
            <span className="meter-label">FLUID LEVEL</span>
            <span className="meter-bars"><i /><i /><i /><i /><i /></span>
          </div>
          <div className="stat-block align-right">
            <span className="stat-label">BEST</span>
            <strong className="stat-value best" data-testid="text-best">{String(best).padStart(4, '0')}</strong>
          </div>
        </div>

        <div className="play-area">
          <GameCanvas key={runKey} callbacks={callbacks} paused={paused} />
          <div className="play-copy top-copy">
            <span className="copy-line">CEILING LOCK</span>
            <span className="copy-line faint">TAP · DRAG · RELEASE</span>
          </div>
          <div className="drag-hint" data-testid="text-instruction">
            <MousePointer2 size={15} />
            <span>{message}</span>
            <ArrowUp size={16} className="hint-arrow" />
          </div>
          {gameState === 'paused' && (
            <div className="state-overlay" data-testid="overlay-paused">
              <div className="overlay-card">
                <span className="overlay-kicker">RUN FROZEN</span>
                <h1>Take a breath.</h1>
                <p>The tower waits. The lava does not.</p>
                <button className="primary-button" onClick={() => setPaused(false)} data-testid="button-resume">
                  <Play size={16} /> RESUME RUN
                </button>
              </div>
            </div>
          )}
          {gameState === 'gameover' && (
            <div className="state-overlay" data-testid="overlay-game-over">
              <div className="overlay-card game-over-card">
                <span className="overlay-kicker danger">FLUID BREACH</span>
                <h1>Stack collapsed.</h1>
                <p>You held the line for <b>{score} points</b>.</p>
                <div className="result-row"><span>THIS RUN</span><strong>{String(score).padStart(4, '0')}</strong></div>
                <div className="result-row"><span>ALL-TIME BEST</span><strong className="best">{String(best).padStart(4, '0')}</strong></div>
                <button className="primary-button" onClick={restart} data-testid="button-replay">
                  <RotateCcw size={16} /> REPLAY
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="control-row">
          <button className="control-button" onClick={() => { if (gameState === 'ready') return; setPaused((value) => !value); }} disabled={gameState === 'ready' || gameState === 'gameover'} data-testid="button-pause">
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
          <div className="run-rule"><span /><span /><span /></div>
          <button className="control-button" onClick={restart} data-testid="button-restart">
            <RotateCcw size={15} /> NEW RUN
          </button>
        </div>

        <footer className="game-footer">
          <div><Flame size={14} /><span>RISING LAVA</span></div>
          <span className="footer-divider">/</span>
          <div><Crosshair size={14} /><span>BUILD WITHIN THE LINE</span></div>
          <span className="version">PS–01</span>
        </footer>
      </section>
      <aside className="desktop-note">
        <p className="eyebrow">ONE-HAND ARCADE / 001</p>
        <h2>Don’t let the<br /><em>pressure</em> win.</h2>
        <p className="note-copy">Every pillar buys you a little more room. Every shaky release spends it.</p>
        <div className="note-rule" />
        <p className="note-foot">Best played in portrait.<br />Sound on. Thumb ready.</p>
      </aside>
    </main>
  );
}

function Router() {
  return (
    <ErrorBoundary resetKey={useLocation()[0]}>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;