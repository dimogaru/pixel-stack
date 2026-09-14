/**
 * Native 8-bit sound synthesizer for Pixel Stack.
 *
 * All effects are generated at runtime with oscillators and gain envelopes.
 * No audio files are downloaded or decoded.
 */
(function registerPixelStackAudio(global) {
  'use strict';

  class PixelStackAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.muted = false;
    }

    /**
     * Creates or resumes the AudioContext after a real user gesture.
     * Mobile browsers block audio until this has happened at least once.
     */
    async unlock() {
      if (!this.context) {
        const AudioContext = global.AudioContext || global.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.22;
        this.master.connect(this.context.destination);
      }

      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      return this.context.state === 'running';
    }

    setMuted(muted) {
      this.muted = muted;
      if (!this.context || !this.master) return;
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(muted ? 0 : 0.22, this.context.currentTime);
    }

    /**
     * Schedules one compact chip-style tone with a hard attack and fast decay.
     */
    tone({ frequency, duration, start = 0, type = 'square', endFrequency, volume = 0.7 }) {
      if (!this.context || !this.master || this.muted || this.context.state !== 'running') return;

      const now = this.context.currentTime + start;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
      gain.gain.setValueAtTime(Math.max(0.0001, volume), now + Math.min(0.035, duration * 0.35));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    }

    playSnap() {
      this.tone({ frequency: 180, endFrequency: 95, duration: 0.075, type: 'square', volume: 0.78 });
      this.tone({ frequency: 540, endFrequency: 310, duration: 0.055, start: 0.025, type: 'square', volume: 0.42 });
    }

    playRotate() {
      this.tone({ frequency: 310, endFrequency: 620, duration: 0.07, type: 'square', volume: 0.48 });
      this.tone({ frequency: 465, endFrequency: 820, duration: 0.055, start: 0.045, type: 'square', volume: 0.34 });
    }

    playClearLine(multiplier = 1) {
      const pitch = 1 + (Math.max(1, Math.min(4, multiplier)) - 1) * 0.12;
      [262, 330, 392, 523, 784].forEach((frequency, index) => {
        this.tone({
          frequency: frequency * pitch,
          endFrequency: frequency * pitch * 1.08,
          duration: 0.105,
          start: index * 0.055,
          type: index % 2 ? 'square' : 'sawtooth',
          volume: 0.42,
        });
      });
    }

    playFreeze() {
      this.tone({ frequency: 1040, endFrequency: 420, duration: 0.34, type: 'sine', volume: 0.42 });
      this.tone({ frequency: 780, endFrequency: 260, duration: 0.3, start: 0.06, type: 'square', volume: 0.22 });
    }

    playBomb() {
      this.tone({ frequency: 150, endFrequency: 42, duration: 0.42, type: 'sawtooth', volume: 0.78 });
      this.tone({ frequency: 85, endFrequency: 32, duration: 0.5, start: 0.035, type: 'square', volume: 0.58 });
    }

    playMelt(blockCount = 1) {
      const weight = Math.min(5, Math.max(1, blockCount));
      this.tone({ frequency: 240 + weight * 18, endFrequency: 72, duration: 0.24, type: 'sawtooth', volume: 0.3 });
      this.tone({ frequency: 110, endFrequency: 48, duration: 0.2, start: 0.035, type: 'square', volume: 0.18 });
    }

    playCombo(multiplier) {
      const step = Math.max(2, Math.min(4, multiplier)) - 2;
      const root = 440 + step * 110;
      this.tone({ frequency: root, endFrequency: root * 1.45, duration: 0.11, type: 'square', volume: 0.38 });
      this.tone({ frequency: root * 1.5, endFrequency: root * 2, duration: 0.1, start: 0.07, type: 'square', volume: 0.3 });
    }

    playGameOver() {
      [392, 330, 247, 165].forEach((frequency, index) => {
        this.tone({
          frequency,
          endFrequency: frequency * 0.72,
          duration: 0.22,
          start: index * 0.14,
          type: 'square',
          volume: 0.54 - index * 0.07,
        });
      });
    }
  }

  global.PixelStackAudio = new PixelStackAudio();
})(window);