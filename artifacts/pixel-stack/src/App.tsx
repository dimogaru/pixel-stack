import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Pause, Play, RotateCcw, Volume2, VolumeX, Flame, MousePointer2, ArrowUp, Crosshair } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type GameState = 'ready' | 'playing' | 'paused' | 'gameover';

type GameCallbacks = {
  onScore: (score: number) => void;
  onLevel: (level: number) => void;
  onState: (state: GameState) => void;
  onMessage: (message: string) => void;
};

declare global {
  interface Window {
    PixelStackGame: {
      create: (
        parent: HTMLElement,
        callbacks: GameCallbacks,
      ) => {
        game: { destroy: (removeCanvas: boolean) => void };
        scene: { gameState: GameState; togglePause: () => void };
      };
    };
  }
}

function GameCanvas({ callbacks, paused }: { callbacks: GameCallbacks; paused: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReturnType<typeof window.PixelStackGame.create> | null>(null);

  useEffect(() => {
    if (!hostRef.current || !window.PixelStackGame) return;
    const engine = window.PixelStackGame.create(hostRef.current, callbacks);
    engineRef.current = engine;

    const preventTouchNavigation = (event: TouchEvent) => event.preventDefault();
    const host = hostRef.current;
    host.addEventListener('touchstart', preventTouchNavigation, { passive: false });
    host.addEventListener('touchmove', preventTouchNavigation, { passive: false });

    return () => {
      host.removeEventListener('touchstart', preventTouchNavigation);
      host.removeEventListener('touchmove', preventTouchNavigation);
      engine.game.destroy(true);
      engineRef.current = null;
    };
  }, [callbacks]);

  useEffect(() => {
    const scene = engineRef.current?.scene;
    if (scene && scene.gameState !== 'gameover' && scene.gameState !== 'ready') {
      scene.togglePause();
    }
  }, [paused]);

  return <div ref={hostRef} className="game-canvas" data-testid="game-surface" />;
}

function Home() {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(window.localStorage.getItem('pixel-stack-best') || 0));
  const [level, setLevel] = useState(1);
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
    onLevel: setLevel,
    onState: (state) => {
      setGameState(state);
      if (state === 'paused') setPaused(true);
      if (state === 'playing') setPaused(false);
    },
    onMessage: setMessage,
  }), []);

  const restart = () => {
    setScore(0);
    setLevel(1);
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
            <span className="meter-label">LEVEL</span>
            <strong className="level-value" data-testid="text-level">{String(level).padStart(2, '0')}</strong>
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