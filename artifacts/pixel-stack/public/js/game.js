/* global Phaser */

/**
 * Pixel Stack game engine.
 *
 * React owns the surrounding HUD while this file owns the Phaser scene,
 * tetromino grid, gravity, anchoring, line clears, scoring, and lava.
 */
(function registerPixelStackGame(global) {
  'use strict';

  const WIDTH = 420;
  const HEIGHT = 720;
  const COLS = 10;
  const ROWS = 18;
  const CELL = 36;
  const BOARD_X = 30;
  const BOARD_Y = 76;
  const BOARD_BOTTOM = BOARD_Y + ROWS * CELL;
  const START_LAVA_TOP = 638;
  const CEILING_Y = BOARD_Y;
  const TAP_MS = 210;
  const TAP_DISTANCE = 12;
  const SCORE_PER_LEVEL = 1000;
  const SPECIAL_CHANCE = 0.15;
  const COMBO_WINDOW_MS = 2000;
  const MAX_COMBO = 4;
  const POWER_UPS = {
    freeze: { color: 0x36b9ff, label: 'FREEZE' },
    bomb: { color: 0xff315c, label: 'BOMB' },
  };

  const COLORS = {
    I: 0x55f2c6,
    O: 0xffcf5a,
    T: 0xf06cff,
    L: 0xff8b4c,
    J: 0x8292ff,
    S: 0x7df07a,
    Z: 0xff5f72,
  };

  const SHAPES = {
    I: [[0, 0], [1, 0], [2, 0], [3, 0]],
    O: [[0, 0], [1, 0], [0, 1], [1, 1]],
    T: [[0, 0], [1, 0], [2, 0], [1, 1]],
    L: [[0, 0], [0, 1], [0, 2], [1, 2]],
    J: [[1, 0], [1, 1], [1, 2], [0, 2]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]],
    Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  };

  const TYPES = Object.keys(SHAPES);

  function lerpColor(c1, c2, t) {
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }

  const THEMES = [
    {
      name: 'CYBERPUNK NEON',
      bg: 0x130f28,
      board: 0x1b1640,
      lava: 0xff6b22,
      lavaLight: 0xffc35c,
      accent: 0x55f2c6,
      spark: 0x55f2c6,
      grid: 0x463a72
    },
    {
      name: 'VOLCANIC CORE',
      bg: 0x160918,
      board: 0x29102d,
      lava: 0xe82222,
      lavaLight: 0xff7a24,
      accent: 0xff6647,
      spark: 0xff9b52,
      grid: 0x5a244f
    },
    {
      name: 'QUANTUM MATRIX',
      bg: 0x081810,
      board: 0x0f291a,
      lava: 0xf2d51b,
      lavaLight: 0xfff690,
      accent: 0x39ff14,
      spark: 0x39ff14,
      grid: 0x1b4d30
    },
    {
      name: 'SPACE ABYSS',
      bg: 0x050508,
      board: 0x0a0a14,
      lava: 0xa91bd4,
      lavaLight: 0xff5eea,
      accent: 0xb68cff,
      spark: 0xffffff,
      grid: 0x29234b
    }
  ];

  function normalize(cells) {
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => [x - minX, y - minY]);
  }

  function rotated(cells) {
    return normalize(cells.map(([x, y]) => [-y, x]));
  }

  function dimensions(cells) {
    return {
      width: Math.max(...cells.map(([x]) => x)) + 1,
      height: Math.max(...cells.map(([, y]) => y)) + 1,
    };
  }

  class PixelStackScene extends Phaser.Scene {
    constructor(callbacks) {
      super('PixelStack');
      this.callbacks = callbacks;
      this.grid = [];
      this.active = null;
      this.effects = [];
      this.sparks = [];
      this.dragging = false;
      this.pointerStart = null;
      this.lavaTop = START_LAVA_TOP;
      this.lavaPausedUntil = 0;
      this.contactPulseUntil = 0;
      this.score = 0;
      this.level = 1;
      this.elapsedRun = 0;
      this.combo = 1;
      this.lastAnchorAt = 0;
      this.gameState = 'ready';
    }

    create() {
      this.graphics = this.add.graphics();
      
      this.levelAnnouncer = this.add.text(WIDTH / 2, HEIGHT / 2, '', {
        fontFamily: '"DM Mono", monospace',
        fontSize: '28px',
        color: '#ffffff',
        align: 'center',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setAlpha(0).setDepth(10);

      this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
      this.input.on('pointermove', (pointer) => this.onPointerMove(pointer));
      this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));
      this.input.on('pointerout', (pointer) => this.onPointerUp(pointer));

      for (let index = 0; index < 58; index += 1) {
        this.sparks.push({
          x: Phaser.Math.Between(22, 398),
          y: Phaser.Math.Between(48, 634),
          size: Phaser.Math.FloatBetween(0.7, 2.2),
          speed: Phaser.Math.FloatBetween(3, 10),
          alpha: Phaser.Math.FloatBetween(0.14, 0.62),
        });
      }
      this.reset('ready');
    }

    reset(nextState = 'ready') {
      this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.active = null;
      this.effects = [];
      this.dragging = false;
      this.pointerStart = null;
      this.lavaTop = START_LAVA_TOP;
      this.lavaPausedUntil = 0;
      this.contactPulseUntil = 0;
      this.score = 0;
      this.level = 1;
      this.elapsedRun = 0;
      this.combo = 1;
      this.lastAnchorAt = 0;
      this.themeIndex = 0;
      this.currentTheme = { ...THEMES[0] };
      this.startTheme = { ...THEMES[0] };
      this.themeT = 1;
      if (this.levelAnnouncer) {
        this.levelAnnouncer.setAlpha(0);
        this.tweens.killTweensOf(this.levelAnnouncer);
      }
      this.setState(nextState);
      this.callbacks.onScore(0);
      this.callbacks.onLevel(1);
      this.callbacks.onCombo?.(1);
      this.spawnPiece(WIDTH / 2);
    }

    setState(state) {
      this.gameState = state;
      this.callbacks.onState(state);
    }

    showLevelAnnouncer() {
      const text = `¡NIVEL ${this.level}!\n${THEMES[this.themeIndex].name}`;
      this.levelAnnouncer.setText(text);
      const hex = '#' + this.currentTheme.accent.toString(16).padStart(6, '0');
      this.levelAnnouncer.setColor(hex);
      this.levelAnnouncer.setAlpha(1);
      this.levelAnnouncer.setScale(0.8);
      this.levelAnnouncer.setY(HEIGHT / 2 + 30);
      
      this.tweens.killTweensOf(this.levelAnnouncer);
      this.tweens.add({
        targets: this.levelAnnouncer,
        y: HEIGHT / 2 - 40,
        scale: 1,
        duration: 2000,
        ease: 'Cubic.easeOut',
      });
      this.tweens.add({
        targets: this.levelAnnouncer,
        alpha: 0,
        delay: 1400,
        duration: 600,
        ease: 'Power2'
      });
    }

    lerpTheme(elapsed) {
      if (this.themeT >= 1) return;
      this.themeT = Math.min(1, this.themeT + elapsed / 1500);
      const t = this.themeT;
      const target = THEMES[this.themeIndex];
      const start = this.startTheme;
      this.currentTheme = {
        bg: lerpColor(start.bg, target.bg, t),
        board: lerpColor(start.board, target.board, t),
        lava: lerpColor(start.lava, target.lava, t),
        lavaLight: lerpColor(start.lavaLight, target.lavaLight, t),
        accent: lerpColor(start.accent, target.accent, t),
        spark: lerpColor(start.spark, target.spark, t),
        grid: lerpColor(start.grid, target.grid, t),
      };
    }

    togglePause() {
      if (this.gameState === 'ready' || this.gameState === 'gameover') return;
      const next = this.gameState === 'paused' ? 'playing' : 'paused';
      this.setState(next);
      this.callbacks.onMessage(next === 'paused' ? 'RUN FROZEN · RESUME WHEN READY' : 'LAVA IS MOVING · KEEP BUILDING');
    }

    startRun() {
      if (this.gameState !== 'ready') return;
      this.setState('playing');
      this.callbacks.onMessage('DRAG UP · TAP QUICKLY TO ROTATE');
      this.showLevelAnnouncer();
    }

    onPointerDown(pointer) {
      if (this.gameState === 'paused' || this.gameState === 'gameover') return;
      if (!this.active || !this.pointerHitsActive(pointer)) return;
      global.PixelStackAudio?.unlock();
      this.startRun();

      this.dragging = true;
      this.pointerStart = { x: pointer.x, y: pointer.y, time: this.time.now };
      this.dragOffset = {
        x: pointer.x - this.active.x,
        y: pointer.y - this.active.y,
      };
      this.active.falling = false;
      this.active.velocityY = 0;
    }

    onPointerMove(pointer) {
      if (!this.dragging || !this.active || this.gameState !== 'playing') return;
      const size = dimensions(this.active.cells);
      const halfWidth = (size.width * CELL) / 2;
      const halfHeight = (size.height * CELL) / 2;
      this.active.x = Phaser.Math.Clamp(pointer.x - this.dragOffset.x, BOARD_X + halfWidth, BOARD_X + COLS * CELL - halfWidth);
      this.active.y = Phaser.Math.Clamp(pointer.y - this.dragOffset.y, CEILING_Y + halfHeight, this.lavaTop - halfHeight - 4);
      this.callbacks.onMessage(this.canAnchor(this.active) ? 'SUPPORT FOUND · RELEASE TO LOCK' : 'NO SUPPORT · RELEASE TO DROP');
    }

    onPointerUp(pointer) {
      if (!this.dragging || !this.active || this.gameState !== 'playing') return;
      this.dragging = false;

      const start = this.pointerStart;
      this.pointerStart = null;
      const travel = start ? Phaser.Math.Distance.Between(start.x, start.y, pointer.x, pointer.y) : Infinity;
      const duration = start ? this.time.now - start.time : Infinity;

      if (duration <= TAP_MS && travel <= TAP_DISTANCE) {
        this.rotateActive();
        return;
      }

      this.releaseActive();
    }

    pointerHitsActive(pointer) {
      const size = dimensions(this.active.cells);
      return (
        Math.abs(pointer.x - this.active.x) <= (size.width * CELL) / 2 + 12 &&
        Math.abs(pointer.y - this.active.y) <= (size.height * CELL) / 2 + 12
      );
    }

    spawnPiece(pointerX = WIDTH / 2) {
      if (this.active || this.gameState === 'gameover') return;
      const type = Phaser.Utils.Array.GetRandom(TYPES);
      const specialRoll = Phaser.Math.RND.frac();
      const powerUp = specialRoll < SPECIAL_CHANCE
        ? (specialRoll < SPECIAL_CHANCE / 2 ? 'freeze' : 'bomb')
        : null;
      const cells = SHAPES[type].map((cell) => [...cell]);
      const size = dimensions(cells);
      const halfWidth = (size.width * CELL) / 2;
      const x = Phaser.Math.Clamp(pointerX, BOARD_X + halfWidth, BOARD_X + COLS * CELL - halfWidth);
      this.active = {
        type,
        cells,
        color: powerUp ? POWER_UPS[powerUp].color : COLORS[type],
        powerUp,
        x,
        y: this.lavaTop - (size.height * CELL) / 2 - 8,
        falling: false,
        velocityY: 0,
      };
      this.callbacks.onMessage(powerUp
        ? `${POWER_UPS[powerUp].label} ${type} · TAP TO ROTATE OR DRAG UP`
        : `${type} PIECE · TAP TO ROTATE OR DRAG UP`);
    }

    rotateActive() {
      if (!this.active) return;
      const previous = this.active.cells;
      const next = rotated(previous);
      this.active.cells = next;
      const size = dimensions(next);
      const halfWidth = (size.width * CELL) / 2;
      const halfHeight = (size.height * CELL) / 2;
      this.active.x = Phaser.Math.Clamp(this.active.x, BOARD_X + halfWidth, BOARD_X + COLS * CELL - halfWidth);
      this.active.y = Phaser.Math.Clamp(this.active.y, CEILING_Y + halfHeight, this.lavaTop - halfHeight - 4);
      if (this.overlapsGrid(this.active)) {
        this.active.cells = previous;
        this.callbacks.onMessage('ROTATION BLOCKED');
      } else {
        global.PixelStackAudio?.playRotate();
        this.callbacks.onMessage('ROTATED 90° · DRAG OR TAP AGAIN');
      }
    }

    releaseActive() {
      if (!this.active) return;
      this.snapActiveToGrid();
      if (this.canAnchor(this.active)) {
        this.anchorActive();
      } else {
        this.active.falling = true;
        this.active.velocityY = 50;
        this.callbacks.onMessage('NO SUPPORT · PIECE FALLING');
      }
    }

    snapActiveToGrid() {
      const size = dimensions(this.active.cells);
      const left = Phaser.Math.Clamp(
        Math.round((this.active.x - BOARD_X - (size.width * CELL) / 2) / CELL),
        0,
        COLS - size.width,
      );
      const top = Phaser.Math.Clamp(
        Math.round((this.active.y - BOARD_Y - (size.height * CELL) / 2) / CELL),
        0,
        ROWS - size.height,
      );
      this.active.x = BOARD_X + (left + size.width / 2) * CELL;
      this.active.y = BOARD_Y + (top + size.height / 2) * CELL;
    }

    activeGridCells(piece) {
      const size = dimensions(piece.cells);
      const left = Math.round((piece.x - BOARD_X - (size.width * CELL) / 2) / CELL);
      const top = Math.round((piece.y - BOARD_Y - (size.height * CELL) / 2) / CELL);
      return piece.cells.map(([x, y]) => ({ col: left + x, row: top + y }));
    }

    overlapsGrid(piece) {
      return this.activeGridCells(piece).some(({ col, row }) => (
        col < 0 || col >= COLS || row < 0 || row >= ROWS || this.grid[row][col]
      ));
    }

    canAnchor(piece) {
      const cells = this.activeGridCells(piece);
      if (cells.some(({ col, row }) => col < 0 || col >= COLS || row < 0 || row >= ROWS || this.grid[row][col])) return false;
      return cells.some(({ col, row }) => (
        row === 0 ||
        (row > 0 && this.grid[row - 1][col]) ||
        (row < ROWS - 1 && this.grid[row + 1][col]) ||
        (col > 0 && this.grid[row][col - 1]) ||
        (col < COLS - 1 && this.grid[row][col + 1])
      ));
    }

    anchorActive() {
      const piece = this.active;
      const placedCells = this.activeGridCells(piece);
      this.updateComboForAnchor();
      for (const { col, row } of placedCells) {
        this.grid[row][col] = { color: piece.color, type: piece.type, powerUp: piece.powerUp };
        this.burstAt(BOARD_X + col * CELL + CELL / 2, BOARD_Y + row * CELL + CELL / 2, piece.color, 3);
      }
      this.active = null;
      this.score += 40 * this.level * this.combo;
      this.callbacks.onScore(this.score);
      this.callbacks.onMessage('ANCHOR LOCKED · STRUCTURE STABLE');
      global.PixelStackAudio?.playSnap();
      this.flashBoard(this.currentTheme.accent, 210);
      this.activatePowerUp(piece.powerUp, placedCells);
      this.clearCompletedRows();
      this.spawnPiece();
    }

    updateComboForAnchor() {
      const now = this.time.now;
      const isQuickPlacement = this.lastAnchorAt > 0 && now - this.lastAnchorAt < COMBO_WINDOW_MS;
      this.setCombo(isQuickPlacement ? Math.min(MAX_COMBO, this.combo + 1) : 1);
      this.lastAnchorAt = now;
      if (this.combo > 1) this.showFloatingText(`COMBO x${this.combo}`, this.currentTheme.accent, HEIGHT * 0.42);
    }

    setCombo(value) {
      if (value === this.combo) return;
      this.combo = value;
      this.callbacks.onCombo?.(value);
    }

    activatePowerUp(powerUp, placedCells) {
      if (powerUp === 'freeze') {
        this.lavaPausedUntil = Math.max(this.lavaPausedUntil, this.time.now + 3000);
        this.showFloatingText('¡CONGELADO!', POWER_UPS.freeze.color);
        this.callbacks.onMessage('FREEZE CORE · LAVA STOPPED FOR 3 SECONDS');
        global.PixelStackAudio?.playFreeze?.();
        return;
      }
      if (powerUp !== 'bomb') return;

      const protectedCells = new Set(placedCells.map(({ col, row }) => `${col}:${row}`));
      const targets = new Set();
      for (const { col, row } of placedCells) {
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
            const nextCol = col + colOffset;
            const nextRow = row + rowOffset;
            const key = `${nextCol}:${nextRow}`;
            if (
              nextCol >= 0 && nextCol < COLS &&
              nextRow >= 0 && nextRow < ROWS &&
              !protectedCells.has(key)
            ) targets.add(key);
          }
        }
      }
      for (const key of targets) {
        const [col, row] = key.split(':').map(Number);
        const block = this.grid[row][col];
        if (!block) continue;
        this.burstAt(BOARD_X + col * CELL + CELL / 2, BOARD_Y + row * CELL + CELL / 2, block.color, 7);
        this.grid[row][col] = null;
      }
      this.lavaTop = Math.min(START_LAVA_TOP, this.lavaTop + CELL * 2);
      this.flashBoard(POWER_UPS.bomb.color, 480);
      this.showFloatingText('¡BOOM!', POWER_UPS.bomb.color);
      this.callbacks.onMessage('BOMB DETONATED · LAVA FORCED DOWN');
      global.PixelStackAudio?.playBomb?.();
    }

    showFloatingText(text, color, y = HEIGHT * 0.5) {
      const label = this.add.text(WIDTH / 2, y, text, {
        fontFamily: '"DM Mono", monospace',
        fontSize: '23px',
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
        stroke: '#080611',
        strokeThickness: 5,
      }).setOrigin(0.5).setDepth(11);
      this.tweens.add({
        targets: label,
        y: y - 58,
        alpha: 0,
        scale: 1.18,
        duration: 900,
        ease: 'Cubic.easeOut',
        onComplete: () => label.destroy(),
      });
    }

    clearCompletedRows() {
      const complete = [];
      for (let row = 0; row < ROWS; row += 1) {
        if (this.grid[row].every(Boolean)) complete.push(row);
      }
      if (!complete.length) return;
      global.PixelStackAudio?.playClearLine();
      this.setCombo(Math.min(MAX_COMBO, this.combo + 1));
      const clearMultiplier = this.combo;
      if (this.combo > 1) this.showFloatingText(`COMBO x${this.combo}`, this.currentTheme.accent, HEIGHT * 0.38);

      for (const row of complete) {
        for (let col = 0; col < COLS; col += 1) {
          this.burstAt(BOARD_X + col * CELL + CELL / 2, BOARD_Y + row * CELL + CELL / 2, this.grid[row][col].color, 5);
        }
      }

      this.effects.push({ kind: 'line', rows: complete, until: this.time.now + 420 });
      this.time.delayedCall(260, () => {
        for (const row of [...complete].sort((a, b) => a - b)) {
          this.grid.splice(row, 1);
          this.grid.unshift(Array(COLS).fill(null));
        }
        this.lavaTop = Math.min(START_LAVA_TOP, this.lavaTop + complete.length * CELL * 2);
        this.score += complete.length * 500 * this.level * clearMultiplier;
        this.callbacks.onScore(this.score);
        this.callbacks.onMessage(`${complete.length} LINE${complete.length > 1 ? 'S' : ''} VENTED · LAVA PUSHED DOWN`);
      });
    }

    update(time, delta) {
      if (!this.graphics) return;
      const elapsed = Math.min(delta || 16, 40);

      this.lerpTheme(elapsed);

      if (this.gameState === 'playing') {
        this.elapsedRun += elapsed;
        if (this.combo > 1 && this.lastAnchorAt > 0 && time - this.lastAnchorAt >= COMBO_WINDOW_MS) {
          this.setCombo(1);
        }
        const nextLevel = 1 + Math.floor(this.score / SCORE_PER_LEVEL);
        if (nextLevel > this.level) {
          this.level = nextLevel;
          this.callbacks.onLevel(this.level);
          this.callbacks.onMessage(`LEVEL ${this.level} · PRESSURE INCREASING`);
          
          const nextThemeIdx = (this.level - 1) % 4;
          if (nextThemeIdx !== this.themeIndex) {
            this.startTheme = { ...this.currentTheme };
            this.themeIndex = nextThemeIdx;
            this.themeT = 0;
            this.showLevelAnnouncer();
          }
        }

        if (time > this.lavaPausedUntil) {
          const lavaSpeed = 0.0075 + (this.level - 1) * 0.0022;
          this.lavaTop -= elapsed * lavaSpeed;
        }

        this.updateFallingPiece(elapsed);
        this.detectLavaContact(time);
        if (this.lavaTop <= CEILING_Y + 2) this.endRun();
      }

      const themeName = THEMES[this.themeIndex].name;
      for (const spark of this.sparks) {
        if (themeName === 'SPACE ABYSS') {
          spark.y += (spark.speed * elapsed) / 1000;
          if (spark.y > 638) { spark.y = 46; spark.x = Phaser.Math.Between(16, 404); }
        } else if (themeName === 'QUANTUM MATRIX') {
          spark.y += (spark.speed * 1.5 * elapsed) / 1000;
          if (spark.y > 638) { spark.y = 46; spark.x = Phaser.Math.Between(16, 404); }
        } else if (themeName === 'VOLCANIC CORE') {
          spark.y -= (spark.speed * 1.5 * elapsed) / 1000;
          if (spark.y < 46) { spark.y = 638; spark.x = Phaser.Math.Between(16, 404); }
        } else {
          spark.y -= (spark.speed * elapsed) / 1000;
          spark.x += (Math.sin(time / 1000 + spark.size) * 0.3);
          if (spark.y < 46) { spark.y = 638; spark.x = Phaser.Math.Between(16, 404); }
          if (spark.x < 16) spark.x = 404;
          if (spark.x > 404) spark.x = 16;
        }
      }
      this.effects = this.effects.filter((effect) => effect.until > time);
      this.draw(time);
    }

    updateFallingPiece(elapsed) {
      if (!this.active || !this.active.falling) return;
      this.active.velocityY = Math.min(760, this.active.velocityY + elapsed * 1.45);
      this.active.y += (this.active.velocityY * elapsed) / 1000;

      if (this.canAnchor(this.active)) {
        this.snapActiveToGrid();
        this.anchorActive();
        return;
      }

      const size = dimensions(this.active.cells);
      const bottom = this.active.y + (size.height * CELL) / 2;
      if (bottom >= this.lavaTop) {
        this.burstAt(this.active.x, this.lavaTop, this.active.color, 15);
        this.active = null;
        this.score = Math.max(0, this.score - 25);
        this.callbacks.onScore(this.score);
        this.setCombo(1);
        this.lastAnchorAt = 0;
        this.callbacks.onMessage('PIECE LOST TO THE LAVA');
        this.contactPulseUntil = this.time.now + 500;
        this.flashBoard(this.currentTheme.lava, 400);
        this.spawnPiece();
      }
    }

    detectLavaContact(time) {
      let touching = false;
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          if (this.grid[row][col] && BOARD_Y + (row + 1) * CELL >= this.lavaTop) touching = true;
        }
      }
      if (touching && time > this.contactPulseUntil) {
        this.lavaPausedUntil = Math.max(this.lavaPausedUntil, time + 650);
        this.contactPulseUntil = time + 1250;
        this.callbacks.onMessage('STRUCTURE CONTACT · PRESSURE PAUSED');
      }
    }

    endRun() {
      if (this.gameState === 'gameover') return;
      this.setState('gameover');
      this.active = null;
      global.PixelStackAudio?.playGameOver();
      this.flashBoard(this.currentTheme.lava, 620);
      this.callbacks.onMessage('FLUID BREACH · RUN ENDED');
      this.callbacks.onGameOver?.(this.score);
    }

    flashBoard(color, duration) {
      this.effects.push({ kind: 'flash', color, until: this.time.now + duration, duration });
    }

    burstAt(x, y, color, count = 10) {
      for (let index = 0; index < count; index += 1) {
        this.effects.push({
          kind: 'particle',
          x,
          y,
          color,
          vx: Phaser.Math.Between(-95, 95),
          vy: Phaser.Math.Between(-120, -30),
          born: this.time.now,
          until: this.time.now + Phaser.Math.Between(330, 620),
        });
      }
    }

    draw(time) {
      const g = this.graphics;
      g.clear();
      g.fillStyle(this.currentTheme.bg, 1);
      g.fillRect(0, 0, WIDTH, HEIGHT);
      g.fillStyle(this.currentTheme.board, 0.56);
      g.fillRect(16, 46, 388, 592);
      this.drawThemeBackdrop(time);

      g.lineStyle(1, this.currentTheme.grid, 0.3);
      for (let col = 0; col <= COLS; col += 1) {
        const x = BOARD_X + col * CELL;
        g.lineBetween(x, BOARD_Y, x, BOARD_BOTTOM);
      }
      for (let row = 0; row <= ROWS; row += 1) {
        const y = BOARD_Y + row * CELL;
        g.lineBetween(BOARD_X, y, BOARD_X + COLS * CELL, y);
      }

      const themeName = THEMES[this.themeIndex].name;
      for (const spark of this.sparks) {
        g.fillStyle(this.currentTheme.spark, spark.alpha);
        let size = spark.size;
        if (themeName === 'QUANTUM MATRIX') {
           g.fillRect(spark.x, spark.y, size, size * 5);
        } else if (themeName === 'SPACE ABYSS') {
           g.fillCircle(spark.x, spark.y, size * 0.7);
        } else {
           g.fillCircle(spark.x, spark.y, size);
        }
      }

      g.fillStyle(this.currentTheme.accent, 0.15);
      g.fillRect(BOARD_X, BOARD_Y, COLS * CELL, CELL);
      g.fillStyle(this.currentTheme.accent, 0.85);
      g.fillRect(BOARD_X, BOARD_Y, COLS * CELL, 3);

      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const block = this.grid[row][col];
          if (block) this.drawBlock(col, row, block, 1, time);
        }
      }

      if (this.active) this.drawActive(this.active);
      this.drawEffects(time);
      this.drawLava(time);

      if (this.gameState === 'paused') {
        g.fillStyle(this.currentTheme.bg, 0.58);
        g.fillRect(16, 46, 388, 592);
      }
    }

    drawThemeBackdrop(time) {
      const g = this.graphics;
      const phase = time * 0.001;

      if (this.themeIndex === 0) {
        g.lineStyle(1, this.currentTheme.accent, 0.12);
        const horizon = 390;
        for (let row = 0; row < 7; row += 1) {
          const y = horizon + row * row * 5.5 + ((time * 0.018) % 13);
          g.lineBetween(16, y, 404, y);
        }
        for (let x = -120; x <= 540; x += 55) {
          g.lineBetween(WIDTH / 2, horizon, x, 638);
        }
      } else if (this.themeIndex === 1) {
        for (let band = 0; band < 6; band += 1) {
          g.fillStyle(this.currentTheme.grid, 0.045 + band * 0.012);
          g.fillRect(16, 46 + band * 98, 388, 98);
        }
        g.lineStyle(2, this.currentTheme.lavaLight, 0.11);
        for (let crack = 0; crack < 5; crack += 1) {
          const x = 55 + crack * 78;
          g.beginPath();
          g.moveTo(x, 52);
          for (let y = 52; y <= 638; y += 42) {
            g.lineTo(x + Math.sin(phase * 0.7 + y * 0.09 + crack) * 13, y);
          }
          g.strokePath();
        }
      } else if (this.themeIndex === 2) {
        g.lineStyle(1, this.currentTheme.accent, 0.13);
        for (let row = 0; row < 6; row += 1) {
          const y = 105 + row * 92;
          const offset = (row % 2) * 24;
          g.lineBetween(24, y, 130 + offset, y);
          g.lineBetween(130 + offset, y, 130 + offset, y + 31);
          g.lineBetween(130 + offset, y + 31, 310, y + 31);
          g.fillStyle(this.currentTheme.lavaLight, 0.24);
          g.fillRect(306, y + 27, 7, 7);
        }
      } else {
        g.fillStyle(this.currentTheme.accent, 0.035);
        g.fillCircle(92, 178, 78 + Math.sin(phase) * 4);
        g.fillStyle(this.currentTheme.lavaLight, 0.025);
        g.fillCircle(338, 420, 112 + Math.cos(phase * 0.7) * 6);
      }
    }

    drawBlock(col, row, block, alpha, time) {
      const x = BOARD_X + col * CELL;
      const y = BOARD_Y + row * CELL;
      const pulse = block.powerUp === 'bomb' ? 0.72 + Math.sin(time / 85) * 0.28 : 1;
      
      this.graphics.fillStyle(block.powerUp ? block.color : this.currentTheme.accent, alpha * 0.12 * pulse);
      this.graphics.fillRect(x - 1, y - 1, CELL + 2, CELL + 2);
      
      this.graphics.fillStyle(0x090718, alpha * 0.78);
      this.graphics.fillRect(x + 4, y + 5, CELL - 5, CELL - 5);
      this.graphics.fillStyle(block.color, alpha * pulse);
      this.graphics.fillRect(x + 2, y + 2, CELL - 5, CELL - 5);
      this.graphics.fillStyle(0xffffff, alpha * 0.24);
      this.graphics.fillRect(x + 4, y + 4, CELL - 9, 3);
      this.graphics.lineStyle(block.powerUp ? 2 : 1, block.color, alpha * 0.85);
      this.graphics.strokeRect(x + 1, y + 1, CELL - 3, CELL - 3);
    }

    drawActive(piece) {
      const size = dimensions(piece.cells);
      const left = piece.x - (size.width * CELL) / 2;
      const top = piece.y - (size.height * CELL) / 2;
      const pulse = piece.powerUp === 'bomb' ? 0.65 + Math.sin(this.time.now / 70) * 0.35 : 1;
      for (const [cellX, cellY] of piece.cells) {
        const x = left + cellX * CELL;
        const y = top + cellY * CELL;
        
        this.graphics.fillStyle(piece.powerUp ? piece.color : this.currentTheme.accent, 0.25 * pulse);
        this.graphics.fillRect(x - 2, y - 2, CELL + 4, CELL + 4);

        this.graphics.fillStyle(0x090718, 0.7);
        this.graphics.fillRect(x + 5, y + 6, CELL - 5, CELL - 5);
        this.graphics.fillStyle(piece.color, (piece.falling ? 0.72 : 1) * pulse);
        this.graphics.fillRect(x + 2, y + 2, CELL - 5, CELL - 5);
        this.graphics.fillStyle(0xffffff, 0.3);
        this.graphics.fillRect(x + 4, y + 4, CELL - 9, 3);
        this.graphics.lineStyle(2, 0xffffff, piece.falling ? 0.35 : 0.82);
        this.graphics.strokeRect(x, y, CELL - 2, CELL - 2);
      }
    }

    drawEffects(time) {
      for (const effect of this.effects) {
        if (effect.kind === 'line') {
          const alpha = 0.35 + Math.abs(Math.sin(time / 45)) * 0.65;
          for (const row of effect.rows) {
            this.graphics.fillStyle(0xffffff, alpha);
            this.graphics.fillRect(BOARD_X, BOARD_Y + row * CELL, COLS * CELL, CELL);
          }
        } else if (effect.kind === 'flash') {
          const alpha = Math.max(0, (effect.until - time) / effect.duration) * 0.18;
          this.graphics.fillStyle(effect.color, alpha);
          this.graphics.fillRect(16, 46, 388, 592);
        } else if (effect.kind === 'particle') {
          const age = (time - effect.born) / 1000;
          const alpha = Math.max(0, (effect.until - time) / (effect.until - effect.born));
          const x = effect.x + effect.vx * age;
          const y = effect.y + effect.vy * age + 220 * age * age;
          this.graphics.fillStyle(effect.color, alpha);
          this.graphics.fillRect(x, y, 4, 4);
        }
      }
    }

    drawLava(time) {
      const contact = time < this.contactPulseUntil;
      const surface = this.lavaTop + Math.sin(time / 240) * 3;
      this.graphics.fillStyle(contact ? this.currentTheme.lavaLight : this.currentTheme.lava, 0.96);
      this.graphics.beginPath();
      this.graphics.moveTo(0, surface);
      for (let x = 0; x <= WIDTH; x += 14) {
        this.graphics.lineTo(x, this.lavaTop + Math.sin(time / 230 + x / 26) * (contact ? 6 : 3));
      }
      this.graphics.lineTo(WIDTH, HEIGHT);
      this.graphics.lineTo(0, HEIGHT);
      this.graphics.closePath();
      this.graphics.fillPath();
      this.graphics.fillStyle(this.currentTheme.lavaLight, contact ? 0.92 : 0.55);
      for (let x = 0; x < WIDTH; x += 20) {
        this.graphics.fillRect(x, this.lavaTop - 2 + Math.sin(time / 160 + x) * 2, 11, 3);
      }
    }
  }

  global.PixelStackGame = {
    create(parent, callbacks) {
      const scene = new PixelStackScene(callbacks);
      const game = new Phaser.Game({
        type: Phaser.CANVAS,
        width: WIDTH,
        height: HEIGHT,
        parent,
        transparent: false,
        backgroundColor: '#130f28',
        render: { antialias: false, pixelArt: true, roundPixels: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        physics: {
          default: 'arcade',
          arcade: { gravity: { y: 900 }, debug: false },
        },
        scene,
      });
      return { game, scene };
    },
  };
})(window);