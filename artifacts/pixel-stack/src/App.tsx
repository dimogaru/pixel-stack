import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HighScore } from '@workspace/api-client-react';
import { Pause, Play, RotateCcw, Volume2, VolumeX, Flame, MousePointer2, ArrowUp, Crosshair, Trophy, X } from 'lucide-react';
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
  onCombo: (combo: number) => void;
  onState: (state: GameState) => void;
  onMessage: (message: string) => void;
  onGameOver: (score: number, endedAtMs: number) => void;
  onRunStart: (verified: boolean) => void;
  onRunAction: (action: RunAction) => void;
  onRunInvalid: () => void;
};

type RunAction = {
  kind: 'anchor';
  pieceIndex: number;
  rotation?: number;
  col?: number;
  row?: number;
  atMs: number;
};

declare global {
  interface Window {
    PixelStackAudio: {
      unlock: () => Promise<boolean>;
      setMuted: (muted: boolean) => void;
      playFreeze: () => void;
      playBomb: () => void;
      playCombo: (multiplier: number) => void;
    };
    PixelStackGame: {
      create: (
        parent: HTMLElement,
        callbacks: GameCallbacks,
      ) => {
        game: { destroy: (removeCanvas: boolean) => void };
        scene: { gameState: GameState; togglePause: () => void; setRunSeed: (seed: number) => void };
      };
    };
  }
}

function GameCanvas({ callbacks, paused, runSeed }: { callbacks: GameCallbacks; paused: boolean; runSeed: number | null }) {
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

  useEffect(() => {
    if (runSeed !== null) engineRef.current?.scene.setRunSeed(runSeed);
  }, [runSeed]);

  return <div ref={hostRef} className="game-canvas" data-testid="game-surface" />;
}

function Home() {
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(window.localStorage.getItem('pixel-stack-best') || 0));
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(1);
  const [gameState, setGameState] = useState<GameState>('ready');
  const [message, setMessage] = useState('TAP THE LOWER FIELD TO DROP IN');
  const [soundOn, setSoundOn] = useState(true);
  const [paused, setPaused] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [scores, setScores] = useState<HighScore[]>([]);
  const [leaderboardStatus, setLeaderboardStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [qualifyingScore, setQualifyingScore] = useState<number | null>(null);
  const [nickname, setNickname] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const runProofRef = useRef<string | null>(null);
  const runActionsRef = useRef<RunAction[]>([]);
  const endedAtMsRef = useRef<number | null>(null);
  const serverRunRef = useRef<ServerRun | null>(null);
  const [runSeed, setRunSeed] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    serverRunRef.current = null;
    setRunSeed(null);
    void fetch('/api/runs', { method: 'POST', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not start verified run');
        const data = await response.json() as ServerRun;
        serverRunRef.current = data;
        setRunSeed(data.seed);
      })
      .catch(() => {
        if (!controller.signal.aborted) serverRunRef.current = null;
      });
    return () => controller.abort();
  }, [runKey]);

  useEffect(() => {
    window.PixelStackAudio?.setMuted(!soundOn);
  }, [soundOn]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      window.localStorage.setItem('pixel-stack-best', String(score));
    }
  }, [score, best]);

  const loadScores = useCallback(async (open = false) => {
    if (open) setLeaderboardOpen(true);
    setLeaderboardStatus('loading');
    try {
      const response = await fetch('/api/scores', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load scores');
      const data = await response.json() as HighScore[];
      setScores(data);
      setLeaderboardStatus('idle');
      return data;
    } catch {
      setLeaderboardStatus('error');
      return null;
    }
  }, []);

  const checkQualification = useCallback(async (finalScore: number) => {
    setQualifyingScore(null);
    setSubmitStatus('idle');
    setSubmitMessage('');
    setNickname('');
    const currentScores = await loadScores();
    if (!currentScores) return;
    const qualifies = currentScores.length < 10 || finalScore > currentScores[currentScores.length - 1].score;
    if (qualifies) setQualifyingScore(finalScore);
  }, [loadScores]);

  const callbacks = useMemo<GameCallbacks>(() => ({
    onScore: setScore,
    onLevel: setLevel,
    onCombo: setCombo,
    onState: (state) => {
      setGameState(state);
      if (state === 'paused') setPaused(true);
      if (state === 'playing') setPaused(false);
    },
    onMessage: setMessage,
    onRunStart: (verified) => {
      runActionsRef.current = [];
      endedAtMsRef.current = null;
      runProofRef.current = verified ? serverRunRef.current?.proof ?? null : null;
    },
    onRunAction: (action) => {
      runActionsRef.current.push(action);
    },
    onRunInvalid: () => {
      runProofRef.current = null;
    },
    onGameOver: (finalScore, endedAtMs) => {
      endedAtMsRef.current = endedAtMs;
      if (runProofRef.current) void checkQualification(finalScore);
    },
  }), [checkQualification]);

  const submitScore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (qualifyingScore === null || submitStatus === 'submitting') return;

    const cleanNickname = nickname.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,10}$/.test(cleanNickname)) {
      setSubmitStatus('error');
      setSubmitMessage('USA 1–10 LETRAS, NÚMEROS, _ O -');
      return;
    }

    setSubmitStatus('submitting');
    setSubmitMessage('');
    try {
      if (!runProofRef.current || endedAtMsRef.current === null) throw new Error('Run was not verified');
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: cleanNickname,
          score: qualifyingScore,
          proof: runProofRef.current,
          actions: runActionsRef.current,
          endedAtMs: endedAtMsRef.current,
        }),
      });
      if (response.status === 409) {
        setQualifyingScore(null);
        setSubmitStatus('error');
        setSubmitMessage('EL TOP 10 HA CAMBIADO. TU MARCA YA NO CLASIFICA.');
        return;
      }
      if (!response.ok) throw new Error('Could not submit score');
      setSubmitStatus('submitted');
      runProofRef.current = null;
      setSubmitMessage('MARCA REGISTRADA EN LA RED GLOBAL');
      await loadScores();
    } catch {
      setSubmitStatus('error');
      setSubmitMessage('NO SE PUDO GUARDAR. INTÉNTALO DE NUEVO.');
    }
  };

  const restart = () => {
    setScore(0);
    setLevel(1);
    setCombo(1);
    setPaused(false);
    setGameState('ready');
    setMessage('TAP THE LOWER FIELD TO DROP IN');
    setQualifyingScore(null);
    setSubmitStatus('idle');
    setSubmitMessage('');
    setNickname('');
    runProofRef.current = null;
    runActionsRef.current = [];
    endedAtMsRef.current = null;
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
            <span className={`combo-value ${combo > 1 ? 'active' : ''}`} data-testid="text-combo">COMBO x{combo}</span>
            <span className="meter-bars"><i /><i /><i /><i /><i /></span>
          </div>
          <div className="stat-block align-right">
            <span className="stat-label">BEST</span>
            <strong className="stat-value best" data-testid="text-best">{String(best).padStart(4, '0')}</strong>
          </div>
        </div>

        <div className="play-area">
          <GameCanvas key={runKey} callbacks={callbacks} paused={paused} runSeed={runSeed} />
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
                {qualifyingScore !== null && submitStatus !== 'submitted' && (
                  <form className="score-entry" onSubmit={submitScore}>
                    <label htmlFor="nickname">TOP 10 · IDENTIFÍCATE</label>
                    <div className="score-entry-row">
                      <input
                        id="nickname"
                        value={nickname}
                        onChange={(event) => setNickname(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 10))}
                        maxLength={10}
                        placeholder="APODO"
                        autoComplete="nickname"
                        autoFocus
                        data-testid="input-nickname"
                      />
                      <button type="submit" disabled={submitStatus === 'submitting'} data-testid="button-submit-score">
                        {submitStatus === 'submitting' ? '...' : 'SEND'}
                      </button>
                    </div>
                  </form>
                )}
                {submitMessage && <p className={`score-message ${submitStatus}`} data-testid="text-score-submit-status">{submitMessage}</p>}
                <button className="primary-button" onClick={restart} data-testid="button-replay">
                  <RotateCcw size={16} /> REPLAY
                </button>
                <button className="secondary-button" onClick={() => void loadScores(true)} data-testid="button-gameover-leaderboard">
                  <Trophy size={15} /> TOP JUGADORES
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
          <button className="control-button leaderboard-trigger" onClick={() => void loadScores(true)} data-testid="button-leaderboard">
            <Trophy size={15} /> TOP JUGADORES
          </button>
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
      {leaderboardOpen && (
        <div className="leaderboard-overlay" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" data-testid="overlay-leaderboard">
          <section className="leaderboard-card">
            <button className="leaderboard-close" onClick={() => setLeaderboardOpen(false)} aria-label="Cerrar clasificación" data-testid="button-close-leaderboard">
              <X size={18} />
            </button>
            <span className="overlay-kicker">GLOBAL NETWORK</span>
            <h2 id="leaderboard-title">Top Jugadores</h2>
            <p className="leaderboard-subtitle">LAS 10 PILAS QUE MÁS RESISTIERON</p>
            {leaderboardStatus === 'loading' && <div className="leaderboard-state">CARGANDO SEÑAL...</div>}
            {leaderboardStatus === 'error' && (
              <div className="leaderboard-state error">
                SIN CONEXIÓN CON EL RANKING
                <button onClick={() => void loadScores()}>REINTENTAR</button>
              </div>
            )}
            {leaderboardStatus === 'idle' && scores.length === 0 && <div className="leaderboard-state">AÚN NO HAY MARCAS</div>}
            {leaderboardStatus === 'idle' && scores.length > 0 && (
              <ol className="leaderboard-list">
                {scores.map((entry, index) => (
                  <li key={entry.id} className={index < 3 ? `rank-${index + 1}` : ''}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{entry.nickname}</strong>
                    <span className="leader-score">{String(entry.score).padStart(4, '0')}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
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

type ServerRun = { proof: string; seed: number };
