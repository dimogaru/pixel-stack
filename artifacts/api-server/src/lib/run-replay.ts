export type RunAction = {
  kind: "anchor";
  pieceIndex: number;
  rotation?: number;
  col?: number;
  row?: number;
  atMs: number;
};

const COLS = 10;
const ROWS = 18;
const SCORE_PER_LEVEL = 1000;
const CELL = 36;
const BOARD_Y = 76;
const START_LAVA_TOP = 638;
const GAME_OVER_LAVA_TOP = 78;
const SIMULATION_STEP_MS = 10;
const TERMINAL_TOLERANCE_MS = 1_000;
const SPECIAL_CHANCE = 0.15;
const COMBO_WINDOW_MS = 2_000;
const MAX_COMBO = 4;
const TYPES = ["I", "O", "T", "L", "J", "S", "Z"] as const;
const SHAPES: Record<(typeof TYPES)[number], Array<[number, number]>> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [0, 1], [0, 2], [1, 2]],
  J: [[1, 0], [1, 1], [1, 2], [0, 2]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

function normalize(cells: Array<[number, number]>): Array<[number, number]> {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

function rotate(cells: Array<[number, number]>): Array<[number, number]> {
  return normalize(cells.map(([x, y]) => [-y, x]));
}

function nextRandom(state: number): number {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

function pieceFor(
  seed: number,
  pieceIndex: number,
  rotations: number,
): { cells: Array<[number, number]>; powerUp: "freeze" | "bomb" | null } {
  let state = seed >>> 0;
  for (let index = 0; index <= pieceIndex; index += 1) state = nextRandom(state);
  let cells = SHAPES[TYPES[state % TYPES.length]].map(([x, y]) => [x, y] as [number, number]);
  for (let index = 0; index < rotations; index += 1) cells = rotate(cells);
  const specialRoll = state / 0x100000000;
  const powerUp = specialRoll < SPECIAL_CHANCE
    ? (specialRoll < SPECIAL_CHANCE / 2 ? "freeze" : "bomb")
    : null;
  return { cells, powerUp };
}

export function applyScoring(
  score: number,
  level: number,
  clearedRows: number,
  anchorCombo = 1,
): { score: number; level: number } {
  const clearCombo = clearedRows > 0 ? Math.min(MAX_COMBO, anchorCombo + 1) : anchorCombo;
  const nextScore = score
    + 40 * level * anchorCombo
    + clearedRows * 500 * level * clearCombo;
  return {
    score: nextScore,
    level: Math.max(level, 1 + Math.floor(nextScore / SCORE_PER_LEVEL)),
  };
}

export function replayRun(
  seed: number,
  actions: RunAction[],
  endedAtMs: number,
  wallElapsedMs: number,
): number | null {
  if (endedAtMs > wallElapsedMs) return null;
  const grid = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  let score = 0;
  let level = 1;
  let previousAtMs = -200;
  let elapsedMs = 0;
  let lavaTop = START_LAVA_TOP;
  let lavaPausedUntil = 0;
  let combo = 1;
  let lastAnchorAt = 0;

  function advanceLava(targetMs: number): number | null {
    while (elapsedMs < targetMs) {
      const step = Math.min(SIMULATION_STEP_MS, targetMs - elapsedMs);
      elapsedMs += step;
      if (elapsedMs > lavaPausedUntil) {
        const lavaSpeed = 0.0075 + (level - 1) * 0.0022;
        lavaTop -= step * lavaSpeed;
      }

      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          if (grid[row][col] && BOARD_Y + (row + 1) * CELL >= lavaTop) {
            return elapsedMs;
          }
        }
      }
      if (lavaTop <= GAME_OVER_LAVA_TOP) return elapsedMs;
    }
    return null;
  }

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (action.pieceIndex !== index || action.atMs > wallElapsedMs || action.atMs - previousAtMs < 200) return null;
    previousAtMs = action.atMs;
    if (advanceLava(action.atMs) !== null) return null;
    if (
      action.kind !== "anchor" ||
      action.rotation === undefined ||
      action.col === undefined ||
      action.row === undefined
    ) return null;

    const { cells, powerUp } = pieceFor(seed, index, action.rotation);
    const positioned = cells.map(([x, y]) => ({ col: action.col! + x, row: action.row! + y }));
    if (positioned.some(({ col, row }) => col < 0 || col >= COLS || row < 0 || row >= ROWS || grid[row][col])) return null;
    if (positioned.some(({ row }) => BOARD_Y + (row + 1) * CELL >= lavaTop + CELL / 2)) return null;
    const supported = positioned.some(({ col, row }) => (
      row === 0 ||
      (row > 0 && grid[row - 1][col]) ||
      (row < ROWS - 1 && grid[row + 1][col]) ||
      (col > 0 && grid[row][col - 1]) ||
      (col < COLS - 1 && grid[row][col + 1])
    ));
    if (!supported) return null;

    const isQuickPlacement = lastAnchorAt > 0 && action.atMs - lastAnchorAt < COMBO_WINDOW_MS;
    combo = isQuickPlacement ? Math.min(MAX_COMBO, combo + 1) : 1;
    lastAnchorAt = action.atMs;
    score += 40 * level * combo;

    for (const { col, row } of positioned) grid[row][col] = true;
    if (powerUp === "freeze") {
      lavaPausedUntil = Math.max(lavaPausedUntil, action.atMs + 3_000);
    } else if (powerUp === "bomb") {
      const protectedCells = new Set(positioned.map(({ col, row }) => `${col}:${row}`));
      for (const { col, row } of positioned) {
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
            const targetCol = col + colOffset;
            const targetRow = row + rowOffset;
            if (
              targetCol >= 0 && targetCol < COLS &&
              targetRow >= 0 && targetRow < ROWS &&
              !protectedCells.has(`${targetCol}:${targetRow}`)
            ) grid[targetRow][targetCol] = false;
          }
        }
      }
      lavaTop = Math.min(START_LAVA_TOP, lavaTop + CELL * 2);
    }

    const complete: number[] = [];
    for (let row = 0; row < ROWS; row += 1) {
      if (grid[row].every(Boolean)) complete.push(row);
    }
    for (const row of complete.sort((a, b) => a - b)) {
      grid.splice(row, 1);
      grid.unshift(Array<boolean>(COLS).fill(false));
    }
    lavaTop = Math.min(START_LAVA_TOP, lavaTop + complete.length * CELL * 2);
    if (complete.length > 0) {
      combo = Math.min(MAX_COMBO, combo + 1);
      score += complete.length * 500 * level * combo;
    }
    level = Math.max(level, 1 + Math.floor(score / SCORE_PER_LEVEL));
  }

  if (endedAtMs < previousAtMs) return null;
  const gameOverAt = advanceLava(endedAtMs + TERMINAL_TOLERANCE_MS);
  if (gameOverAt === null || Math.abs(endedAtMs - gameOverAt) > TERMINAL_TOLERANCE_MS) return null;
  return score;
}