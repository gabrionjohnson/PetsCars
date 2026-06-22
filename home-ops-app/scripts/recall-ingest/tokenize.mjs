const STOPWORDS = new Set([
  'the', 'and', 'or', 'with', 'for', 'a', 'an', 'of', 'in', 'on', 'to', 'inc', 'co', 'llc', 'corp',
]);

/**
 * Mirrors src/domain/recallMatching.ts#tokenize. Duplicated rather than
 * shared because this script runs standalone under plain Node (CI/cron),
 * outside the Expo/Metro bundle — keep the two in sync if you change either.
 */
export function tokenize(text) {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return Array.from(new Set(tokens));
}
