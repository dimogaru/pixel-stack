import type { HighScore } from '@workspace/api-client-react';
import { API_BASE_URL } from './api';

const CACHE_KEY = `pixel-stack-leaderboard-v1:${API_BASE_URL}`;

export function parseHighScores(value: unknown): HighScore[] {
  if (!Array.isArray(value) || !value.every((entry) => (
    entry && typeof entry.id === 'number' && Number.isInteger(entry.id)
    && typeof entry.name === 'string' && entry.name.length > 0
    && typeof entry.score === 'number' && Number.isInteger(entry.score) && entry.score >= 0
    && typeof entry.created_at === 'string'
  ))) {
    throw new Error('Invalid leaderboard response');
  }
  return value.slice(0, 20);
}

export function readCachedScores(): HighScore[] | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached === null ? null : parseHighScores(JSON.parse(cached));
  } catch {
    return null; // Storage can be unavailable or contain corrupt/old data.
  }
}

export function cacheScores(scores: HighScore[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(scores));
  } catch {
    // A storage quota/privacy restriction must not turn a successful read into an error.
  }
}
