/* global Phaser */

/**
 * Pixel Stack game engine.
 *
 * React owns the surrounding HUD while this file owns the Phaser scene,
 * tetromino grid, gravity, anchoring, line clears, scoring, and lava.
 */
(function registerPixelStackGame(global) {
  'use strict';
  const t = (key, values) => global.PixelStackI18n?.t(key, values) || key;

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
  const SPAWN_GRACE_MS = 1500;
  const levelForScore = (score) => Math.floor(Math.max(0, score) / SCORE_PER_LEVEL) + 1;
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
      this.freezeCountdownUntil = 0;
      this.freezeCountdownFading = false;
      this.contactPulseUntil = 0;
      this.score = 0;
      this.level = 1;
      this.elapsedRun = 0;
      this.combo = 1;
      this.lastAnchorAt = 0;
      this.gameState = 'ready';
      this.runStarted = false;
      this.runSeed = null;
      this.randomState = 0;
      this.pieceCounter = 0;
      this.nextPiece = null;
      this.gameOverGraceUntil = 0;
      this.levelAnnouncementQueue = [];
      this.levelAnnouncementActive = false;
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

      this.freezeCountdownLabel = this.add.text(WIDTH / 2, START_LAVA_TOP + 34, '', {
        fontFamily: '"DM Mono", monospace',
        fontSize: '58px',
        color: '#34d9ff',
        fontStyle: 'bold',
        stroke: '#041726',
        strokeThickness: 8,
      })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(12)
        .setShadow(0, 0, '#34d9ff', 18, true, true);

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
      this.freezeCountdownUntil = 0;
      this.freezeCountdownFading = false;
      this.contactPulseUntil = 0;
      this.score = 0;
      this.level = 1;
      this.elapsedRun = 0;
      this.runStarted = false;
      this.pieceCounter = 0;
      this.nextPiece = null;
      this.gameOverGraceUntil = SPAWN_GRACE_MS;
      this.combo = 1;
      this.lastAnchorAt = 0;
      this.themeIndex = 0;
      this.currentTheme = { ...THEMES[0] };
      this.startTheme = { ...THEMES[0] };
      this.themeT = 1;
      this.levelAnnouncementQueue = [];
      this.levelAnnouncementActive = false;
      if (this.levelAnnouncer) {
        this.levelAnnouncer.setAlpha(0);
        this.tweens.killTweensOf(this.levelAnnouncer);
      }
      if (this.freezeCountdownLabel) {
        this.tweens.killTweensOf(this.freezeCountdownLabel);
        this.freezeCountdownLabel.setVisible(false).setAlpha(0).setScale(1);
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

    showLevelAnnouncer(level = this.level, themeIndex = this.themeIndex) {
      this.levelAnnouncementQueue.push({ level, themeIndex });
      this.playNextLevelAnnouncement();
    }

    playNextLevelAnnouncement() {
      if (this.levelAnnouncementActive || !this.levelAnnouncementQueue.length) return;
      this.levelAnnouncementActive = true;
      const announcement = this.levelAnnouncementQueue.shift();
      const theme = THEMES[announcement.themeIndex];
      this.callbacks.onLevel(announcement.level);
      if (announcement.level > 1) {
        this.callbacks.onMessage(t('pressureIncreasing', { level: announcement.level }));
        this.startTheme = { ...this.currentTheme };
        this.themeIndex = announcement.themeIndex;
        this.themeT = 0;
      }
      const text = `${t('levelUp', { level: announcement.level })}\n${theme.name}`;
      this.levelAnnouncer.setText(text);
      const hex = '#' + theme.accent.toString(16).padStart(6, '0');
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
        ease: 'Power2',
        onComplete: () => {
          this.levelAnnouncementActive = false;
          this.playNextLevelAnnouncement();
        },
      });
    }

    syncLevelToScore() {
      const targetLevel = levelForScore(this.score);
      while (this.level < targetLevel) {
        this.level += 1;
        const nextThemeIdx = (this.level - 1) % THEMES.length;
        this.showLevelAnnouncer(this.level, nextThemeIdx);
      }
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
      this.callbacks.onMessage(next === 'paused' ? t('pausedMessage') : t('resumedMessage'));
    }

    startRun() {
      if (this.gameState !== 'ready') return;
      if (!this.runStarted) {
        this.runStarted = true;
        this.callbacks.onRunStart?.(this.runSeed !== null);
      }
      this.setState('playing');
      this.callbacks.onMessage(t('dragHint'));
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
      this.callbacks.onMessage(this.canAnchor(this.active) ? t('supportFound') : t('noSupportDrop'));
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
      const descriptor = this.nextPiece || this.generatePieceDescriptor();
      this.nextPiece = this.generatePieceDescriptor();
      const { type, powerUp, color } = descriptor;
      const cells = SHAPES[type].map((cell) => [...cell]);
      const size = dimensions(cells);
      const halfWidth = (size.width * CELL) / 2;
      const x = Phaser.Math.Clamp(pointerX, BOARD_X + halfWidth, BOARD_X + COLS * CELL - halfWidth);
      this.active = {
        type,
        cells,
        color,
        powerUp,
        x,
        y: this.lavaTop - (size.height * CELL) / 2 - 8,
        falling: false,
        velocityY: 0,
        pieceIndex: this.pieceCounter,
        rotation: 0,
      };
      this.pieceCounter += 1;
      this.gameOverGraceUntil = this.elapsedRun + SPAWN_GRACE_MS;
      this.callbacks.onMessage(powerUp
        ? t('specialPieceHint', { powerUp: t(powerUp === 'freeze' ? 'freezePower' : 'bombPower'), type })
        : t('pieceHint', { type }));
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
        this.callbacks.onMessage(t('rotationBlocked'));
      } else {
        this.active.rotation = (this.active.rotation + 1) % 4;
        global.PixelStackAudio?.playRotate();
        this.callbacks.onMessage(t('rotated'));
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
        this.callbacks.onMessage(t('pieceFalling'));
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
      this.callbacks.onRunAction?.({
        kind: 'anchor',
        pieceIndex: piece.pieceIndex,
        rotation: piece.rotation,
        col: Math.min(...placedCells.map(({ col }) => col)),
        row: Math.min(...placedCells.map(({ row }) => row)),
        atMs: Math.round(this.elapsedRun),
      });
      this.callbacks.onScore(this.score);
      this.callbacks.onMessage(t('anchorLocked'));
      global.PixelStackAudio?.playSnap();
      this.flashBoard(this.currentTheme.accent, 210);
      this.activatePowerUp(piece.powerUp, placedCells);
      this.clearCompletedRows();
      this.spawnPiece();
    }

    updateComboForAnchor() {
      const now = this.elapsedRun;
      const isQuickPlacement = this.lastAnchorAt > 0 && now - this.lastAnchorAt < COMBO_WINDOW_MS;
      this.setCombo(isQuickPlacement ? Math.min(MAX_COMBO, this.combo + 1) : 1);
      this.lastAnchorAt = now;
      if (this.combo > 1) {
        this.showFloatingText(t('combo', { value: this.combo }), this.currentTheme.accent, HEIGHT * 0.42);
        global.PixelStackAudio?.playCombo?.(this.combo);
      }
    }

    setCombo(value) {
      if (value === this.combo) return;
      this.combo = value;
      this.callbacks.onCombo?.(value);
    }

    activatePowerUp(powerUp, placedCells) {
      if (powerUp === 'freeze') {
        this.lavaPausedUntil = Math.max(this.lavaPausedUntil, this.elapsedRun + 3000);
        this.startFreezeCountdown(this.lavaPausedUntil);
        this.showFloatingText(t('frozen'), POWER_UPS.freeze.color);
        this.callbacks.onMessage(t('freezeMessage'));
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
      this.cameras.main.shake(180, 0.004);
      this.flashBoard(POWER_UPS.bomb.color, 480);
      this.showFloatingText(t('boom'), POWER_UPS.bomb.color);
      this.callbacks.onMessage(t('bombMessage'));
      global.PixelStackAudio?.playBomb?.();
    }

    startFreezeCountdown(until) {
      this.freezeCountdownUntil = until;
      this.freezeCountdownFading = false;
      this.tweens.killTweensOf(this.freezeCountdownLabel);
      this.freezeCountdownLabel
        .setText('3')
        .setVisible(true)
        .setAlpha(1)
        .setScale(1);
    }

    updateFreezeCountdown(time) {
      const label = this.freezeCountdownLabel;
      if (!label?.visible || this.freezeCountdownUntil <= 0) return;

      const labelY = Phaser.Math.Clamp(this.lavaTop + 38, BOARD_Y + 54, HEIGHT - 46);
      label.setY(labelY);

      if (time < this.freezeCountdownUntil) {
        const remaining = Math.max(1, Math.ceil((this.freezeCountdownUntil - time) / 1000));
        const pulse = (Math.sin(time / 105) + 1) / 2;
        label
          .setText(String(remaining))
          .setAlpha(0.78 + pulse * 0.22)
          .setScale(0.96 + pulse * 0.08);
        return;
      }

      if (this.freezeCountdownFading) return;
      this.freezeCountdownFading = true;
      label.setText('0').setAlpha(1).setScale(1.08);
      this.tweens.add({
        targets: label,
        alpha: 0,
        scale: 1.3,
        duration: 420,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          label.setVisible(false);
          this.freezeCountdownUntil = 0;
          this.freezeCountdownFading = false;
        },
      });
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
      let clearedRows = 0;
      let completeRow = this.grid.findIndex((row) => row.every(Boolean));
      while (completeRow !== -1) {
        this.setCombo(Math.min(MAX_COMBO, this.combo + 1));
        const clearMultiplier = this.combo;
        clearedRows += 1;

        for (let col = 0; col < COLS; col += 1) {
          const block = this.grid[completeRow][col];
          this.burstAt(
            BOARD_X + col * CELL + CELL / 2,
            BOARD_Y + completeRow * CELL + CELL / 2,
            block.color,
            5 + clearedRows,
          );
        }

        this.effects.push({ kind: 'line', rows: [completeRow], until: this.time.now + 420 });
        for (let row = completeRow; row < ROWS - 1; row += 1) {
          this.grid[row] = this.grid[row + 1];
        }
        this.grid[ROWS - 1] = Array(COLS).fill(null);

        this.lavaTop = Math.min(START_LAVA_TOP, this.lavaTop + CELL * 2);
        this.score += 500 * this.level * clearMultiplier;
        global.PixelStackAudio?.playClearLine?.(clearMultiplier);
        global.PixelStackAudio?.playCombo?.(clearMultiplier);
        this.showFloatingText(t('combo', { value: clearMultiplier }), this.currentTheme.accent, HEIGHT * 0.38);
        this.cameras.main.shake(140 + clearedRows * 25, 0.0025 + clearedRows * 0.0004);
        this.flashBoard(this.currentTheme.accent, 210 + clearedRows * 55);

        completeRow = this.grid.findIndex((row) => row.every(Boolean));
      }

      if (!clearedRows) return;
      this.callbacks.onScore(this.score);
      this.callbacks.onMessage(t('linesVented', {
        count: clearedRows,
        lines: t(clearedRows > 1 ? 'lines' : 'line'),
      }));
    }

    update(time, delta) {
      if (!this.graphics) return;
      const elapsed = Math.min(delta || 16, 40);

      this.lerpTheme(elapsed);

      if (this.gameState === 'playing') {
        this.elapsedRun += elapsed;
        this.meltBlocksInLava(time);
        if (this.hasLavaBreach()) {
          this.endRun();
        }
      }

      if (this.gameState === 'playing') {
        if (this.combo > 1 && this.lastAnchorAt > 0 && this.elapsedRun - this.lastAnchorAt >= COMBO_WINDOW_MS) {
          this.setCombo(1);
        }
        this.syncLevelToScore();

        this.updateFreezeCountdown(this.elapsedRun);
        if (this.elapsedRun > this.lavaPausedUntil) {
          const lavaSpeed = 0.0075 + (this.level - 1) * 0.0022;
          this.lavaTop -= elapsed * lavaSpeed;
        }

        this.meltBlocksInLava(time);
        if (this.hasLavaBreach()) {
          this.endRun();
        } else {
          this.updateFallingPiece(elapsed);
        }
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

    meltBlocksInLava(time) {
      let melted = 0;
      for (let row = ROWS - 1; row >= 0; row -= 1) {
        const blockBottom = BOARD_Y + (row + 1) * CELL;
        if (blockBottom < this.lavaTop) continue;
        for (let col = 0; col < COLS; col += 1) {
          const block = this.grid[row][col];
          if (!block) continue;
          const x = BOARD_X + col * CELL + CELL / 2;
          const y = BOARD_Y + row * CELL + CELL / 2;
          this.grid[row][col] = null;
          melted += 1;
          this.burstAt(x, y, this.currentTheme.lavaLight, 9);
          this.effects.push({
            kind: 'melt',
            x,
            y,
            color: block.color,
            born: time,
            until: time + 620,
          });
        }
      }
      if (melted > 0) {
        this.contactPulseUntil = this.elapsedRun + 420;
        this.flashBoard(this.currentTheme.lavaLight, 180);
        global.PixelStackAudio?.playMelt?.(melted);
      }
      return melted;
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
        this.callbacks.onRunInvalid?.();
        this.callbacks.onScore(this.score);
        this.setCombo(1);
        this.lastAnchorAt = 0;
        this.callbacks.onMessage(t('pieceLost'));
        this.contactPulseUntil = this.elapsedRun + 500;
        this.flashBoard(this.currentTheme.lava, 400);
        this.spawnPiece();
      }
    }

    hasLavaBreach() {
      if (this.elapsedRun < this.gameOverGraceUntil) return false;
      return this.lavaTop <= CEILING_Y + 2;
    }

    endRun() {
      if (this.gameState === 'gameover') return;
      this.setState('gameover');
      this.dragging = false;
      this.pointerStart = null;
      this.active = null;
      this.freezeCountdownUntil = 0;
      this.freezeCountdownFading = false;
      this.tweens.killTweensOf(this.freezeCountdownLabel);
      this.freezeCountdownLabel.setVisible(false).setAlpha(0);
      global.PixelStackAudio?.playGameOver();
      this.flashBoard(this.currentTheme.lava, 620);
      this.callbacks.onMessage(t('breachEnded'));
      this.callbacks.onGameOver?.(this.score, Math.round(this.elapsedRun));
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
      this.drawNextPiecePreview(time);

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

    drawNextPiecePreview(time) {
      if (!this.nextPiece) return;
      const g = this.graphics;
      const panelX = 324;
      const panelY = 10;
      const panelWidth = 80;
      const panelHeight = 58;
      const cells = SHAPES[this.nextPiece.type];
      const size = dimensions(cells);
      const miniCell = 9;
      const shapeWidth = size.width * miniCell;
      const shapeHeight = size.height * miniCell;
      const startX = panelX + (panelWidth - shapeWidth) / 2;
      const startY = panelY + 24 + (panelHeight - 26 - shapeHeight) / 2;
      const pulse = this.nextPiece.powerUp === 'bomb'
        ? 0.72 + Math.sin(time / 90) * 0.28
        : 1;

      g.fillStyle(0x080611, 0.88);
      g.fillRect(panelX, panelY, panelWidth, panelHeight);
      g.lineStyle(2, this.nextPiece.color, 0.82);
      g.strokeRect(panelX, panelY, panelWidth, panelHeight);
      g.fillStyle(this.nextPiece.color, 0.86);
      for (const [cellX, cellY] of cells) {
        const x = startX + cellX * miniCell;
        const y = startY + cellY * miniCell;
        g.fillRect(x, y, miniCell - 1, miniCell - 1);
        g.fillStyle(0xffffff, 0.34 * pulse);
        g.fillRect(x + 1, y + 1, miniCell - 3, 2);
        g.fillStyle(this.nextPiece.color, 0.86 * pulse);
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
        } else if (effect.kind === 'melt') {
          const progress = Math.min(1, (time - effect.born) / (effect.until - effect.born));
          const alpha = Math.max(0, 1 - progress);
          this.graphics.fillStyle(this.currentTheme.lavaLight, alpha * 0.55);
          this.graphics.fillRect(effect.x - CELL / 2, effect.y - CELL / 2, CELL, CELL);
          this.graphics.fillStyle(0x24141f, alpha * 0.42);
          this.graphics.fillCircle(effect.x - 7, effect.y - 10 - progress * 24, 7 + progress * 5);
          this.graphics.fillCircle(effect.x + 6, effect.y - 5 - progress * 31, 5 + progress * 4);
          this.graphics.lineStyle(2, effect.color, alpha * 0.8);
          this.graphics.strokeRect(effect.x - CELL / 2 + 2, effect.y - CELL / 2 + 2, CELL - 4, CELL - 4);
        }
      }
    }

    drawLava(time) {
      const contact = this.elapsedRun < this.contactPulseUntil;
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

    setRunSeed(seed) {
      if (this.gameState !== 'ready' || this.runStarted) return;
      this.runSeed = Number.isInteger(seed) ? seed >>> 0 : null;
      this.randomState = this.runSeed || 0;
      this.pieceCounter = 0;
      this.active = null;
      this.nextPiece = null;
      this.spawnPiece(WIDTH / 2);
    }

    generatePieceDescriptor() {
      const { type, specialRoll } = this.nextPieceDescriptor();
      const powerUp = specialRoll < SPECIAL_CHANCE
        ? (specialRoll < SPECIAL_CHANCE / 2 ? 'freeze' : 'bomb')
        : null;
      return {
        type,
        powerUp,
        color: powerUp ? POWER_UPS[powerUp].color : COLORS[type],
      };
    }

    nextPieceDescriptor() {
      if (this.runSeed === null) {
        return {
          type: Phaser.Utils.Array.GetRandom(TYPES),
          specialRoll: Phaser.Math.RND.frac(),
        };
      }
      const randomValue = this.nextRandomValue();
      return {
        type: TYPES[randomValue % TYPES.length],
        specialRoll: randomValue / 0x100000000,
      };
    }

    nextRandomValue() {
      let value = this.randomState >>> 0;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      this.randomState = value >>> 0;
      return this.randomState;
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
