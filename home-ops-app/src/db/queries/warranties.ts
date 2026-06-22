import { getDatabase } from '../client';
import type { Warranty } from '../../types/models';

interface WarrantyRow {
  id: number;
  appliance_id: number;
  provider: string;
  expires_on: string;
  document_uri: string | null;
  last_alerted_at: string | null;
}

function toWarranty(row: WarrantyRow): Warranty {
  return {
    id: row.id,
    applianceId: row.appliance_id,
    provider: row.provider,
    expiresOn: row.expires_on,
    documentUri: row.document_uri,
  };
}

export interface CreateWarrantyInput {
  applianceId: number;
  provider: string;
  expiresOn: string;
  documentUri?: string | null;
}

export async function createWarranty(input: CreateWarrantyInput): Promise<Warranty> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO warranty (appliance_id, provider, expires_on, document_uri) VALUES (?, ?, ?, ?)`,
    [input.applianceId, input.provider, input.expiresOn, input.documentUri ?? null]
  );
  const row = await db.getFirstAsync<WarrantyRow>('SELECT * FROM warranty WHERE id = ?', [
    result.lastInsertRowId,
  ]);
  if (!row) throw new Error('Failed to create warranty');
  return toWarranty(row);
}

export async function listWarrantiesForAppliance(applianceId: number): Promise<Warranty[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WarrantyRow>(
    'SELECT * FROM warranty WHERE appliance_id = ? ORDER BY expires_on ASC',
    [applianceId]
  );
  return rows.map(toWarranty);
}

export async function listWarrantiesForHome(
  homeId: number
): Promise<(Warranty & { applianceName: string })[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WarrantyRow & { appliance_name: string }>(
    `SELECT w.*, a.name as appliance_name
     FROM warranty w
     JOIN appliance a ON a.id = w.appliance_id
     WHERE a.home_id = ?
     ORDER BY w.expires_on ASC`,
    [homeId]
  );
  return rows.map((row) => ({ ...toWarranty(row), applianceName: row.appliance_name }));
}

/** Warranties for a home that haven't been alerted on yet, with their appliance name. */
export async function listUnalertedWarrantiesForHome(
  homeId: number
): Promise<(Warranty & { applianceName: string })[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WarrantyRow & { appliance_name: string }>(
    `SELECT w.*, a.name as appliance_name
     FROM warranty w
     JOIN appliance a ON a.id = w.appliance_id
     WHERE a.home_id = ? AND w.last_alerted_at IS NULL
     ORDER BY w.expires_on ASC`,
    [homeId]
  );
  return rows.map((row) => ({ ...toWarranty(row), applianceName: row.appliance_name }));
}

export async function markWarrantyAlerted(id: number, alertedAt: Date = new Date()): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE warranty SET last_alerted_at = ? WHERE id = ?', [
    alertedAt.toISOString(),
    id,
  ]);
}
