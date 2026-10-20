import { BoundarySnapshot } from '@scenesync/shared-types';
import crypto from 'crypto';

export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ');
}

export function hashQuestion(question: string): string {
  const normalized = normalizeQuestion(question);
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

export function generateRecapCacheKey(
  showId: string,
  boundary: BoundarySnapshot,
  contentVersion: string = 'v1'
): string {
  const boundaryTag = boundary.canonicalOrder !== null ? `ord_${boundary.canonicalOrder}` : 'not_started';
  return `scenesync:recap:${showId}:${boundaryTag}:${contentVersion}`;
}

export function generateQuestionCacheKey(
  showId: string,
  boundary: BoundarySnapshot,
  question: string,
  contentVersion: string = 'v1'
): string {
  const boundaryTag = boundary.canonicalOrder !== null ? `ord_${boundary.canonicalOrder}` : 'not_started';
  const qHash = hashQuestion(question);
  return `scenesync:qa:${showId}:${boundaryTag}:${contentVersion}:${qHash}`;
}

export function generateCharacterCacheKey(
  showId: string,
  characterId: string,
  boundary: BoundarySnapshot,
  contentVersion: string = 'v1'
): string {
  const boundaryTag = boundary.canonicalOrder !== null ? `ord_${boundary.canonicalOrder}` : 'not_started';
  return `scenesync:char:${showId}:${characterId}:${boundaryTag}:${contentVersion}`;
}
