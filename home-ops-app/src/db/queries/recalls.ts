import { getDatabase } from '../client';
import type { RecallDatasetMeta, RecallMatch, RecallMatchStatus } from '../../types/models';
import type { RecallMatchResult } from '../../domain/recallMatching';

interface RecallMatchRow {
  id: number;
  appliance_id: number;
  recall_id: string;
  recall_title: string;
  recall_url: string;
  hazard: string;
  matched_on: string;
  status: RecallMatchStatus;
  created_at: string;
}

function toRecallMatch(row: RecallMatchRow): RecallMatch {
  return {
    id: row.id,
    applianceId: row.appliance_id,
    recallId: row.recall_id,
    recallTitle: row.recall_title,
    recallUrl: row.recall_url,
    hazard: row.hazard,
    matchedOn: row.matched_on,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function getRecallDatasetMeta(): Promise<RecallDatasetMeta> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_synced_at: string | null; version: string | null }>(
    'SELECT last_synced_at, version FROM recall_dataset_meta WHERE id = 1'
  );
  return { lastSyncedAt: row?.last_synced_at ?? null, version: row?.version ?? null };
}

export async function setRecallDatasetMeta(version: string, syncedAt: Date = new Date()): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO recall_dataset_meta (id, last_synced_at, version) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_synced_at = excluded.last_synced_at, version = excluded.version`,
    [syncedAt.toISOString(), version]
  );
}

/**
 * Inserts newly found recall matches, skipping ones already recorded for the
 * same appliance+recall pair. Returns only the matches that were newly inserted
 * so callers can fire a single push alert per genuinely new match.
 */
export async function recordNewRecallMatches(
  matches: RecallMatchResult[]
): Promise<RecallMatch[]> {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();
  const inserted: RecallMatch[] = [];
  for (const match of matches) {
    const result = await db.runAsync(
      `INSERT INTO recall_match (appliance_id, recall_id, recall_title, recall_url, hazard, matched_on, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?)
       ON CONFLICT(appliance_id, recall_id) DO NOTHING`,
      [
        match.applianceId,
        match.recall.id,
        match.recall.title,
        match.recall.url,
        match.recall.hazard,
        match.matchedOn,
        createdAt,
      ]
    );
    if (result.changes > 0) {
      const row = await db.getFirstAsync<RecallMatchRow>(
        'SELECT * FROM recall_match WHERE id = ?',
        [result.lastInsertRowId]
      );
      if (row) inserted.push(toRecallMatch(row));
    }
  }
  return inserted;
}

export async function listRecallMatchesForHome(homeId: number): Promise<RecallMatch[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RecallMatchRow>(
    `SELECT rm.* FROM recall_match rm
     JOIN appliance a ON a.id = rm.appliance_id
     WHERE a.home_id = ?
     ORDER BY rm.created_at DESC`,
    [homeId]
  );
  return rows.map(toRecallMatch);
}

export async function setRecallMatchStatus(id: number, status: RecallMatchStatus): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE recall_match SET status = ? WHERE id = ?', [status, id]);
}
