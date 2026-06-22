import { getDatabase } from '../client';
import type { Appliance } from '../../types/models';

interface ApplianceRow {
  id: number;
  home_id: number;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  notes: string | null;
}

function toAppliance(row: ApplianceRow): Appliance {
  return {
    id: row.id,
    homeId: row.home_id,
    name: row.name,
    type: row.type,
    brand: row.brand,
    model: row.model,
    purchaseDate: row.purchase_date,
    notes: row.notes,
  };
}

export interface CreateApplianceInput {
  homeId: number;
  name: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
}

export async function createAppliance(input: CreateApplianceInput): Promise<Appliance> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO appliance (home_id, name, type, brand, model, purchase_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.homeId,
      input.name,
      input.type,
      input.brand ?? null,
      input.model ?? null,
      input.purchaseDate ?? null,
      input.notes ?? null,
    ]
  );
  const row = await db.getFirstAsync<ApplianceRow>('SELECT * FROM appliance WHERE id = ?', [
    result.lastInsertRowId,
  ]);
  if (!row) throw new Error('Failed to create appliance');
  return toAppliance(row);
}

export async function listAppliancesForHome(homeId: number): Promise<Appliance[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ApplianceRow>(
    'SELECT * FROM appliance WHERE home_id = ? ORDER BY name ASC',
    [homeId]
  );
  return rows.map(toAppliance);
}

export async function getApplianceById(id: number): Promise<Appliance | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ApplianceRow>('SELECT * FROM appliance WHERE id = ?', [id]);
  return row ? toAppliance(row) : null;
}

export async function deleteAppliance(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM appliance WHERE id = ?', [id]);
}
