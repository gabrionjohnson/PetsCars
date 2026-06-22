import { getDatabase } from '../client';
import type { ClimateZone, Home, HomeAgeBand } from '../../types/models';

interface HomeRow {
  id: number;
  nickname: string;
  address: string | null;
  year_built: number | null;
  home_age_band: HomeAgeBand;
  climate_zone: ClimateZone;
  created_at: string;
}

function toHome(row: HomeRow): Home {
  return {
    id: row.id,
    nickname: row.nickname,
    address: row.address,
    yearBuilt: row.year_built,
    homeAgeBand: row.home_age_band,
    climateZone: row.climate_zone,
    createdAt: row.created_at,
  };
}

export interface CreateHomeInput {
  nickname: string;
  address?: string | null;
  yearBuilt?: number | null;
  homeAgeBand: HomeAgeBand;
  climateZone: ClimateZone;
}

export async function createHome(input: CreateHomeInput): Promise<Home> {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO home (nickname, address, year_built, home_age_band, climate_zone, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.nickname,
      input.address ?? null,
      input.yearBuilt ?? null,
      input.homeAgeBand,
      input.climateZone,
      createdAt,
    ]
  );
  const row = await db.getFirstAsync<HomeRow>('SELECT * FROM home WHERE id = ?', [
    result.lastInsertRowId,
  ]);
  if (!row) throw new Error('Failed to create home');
  return toHome(row);
}

export async function getFirstHome(): Promise<Home | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<HomeRow>('SELECT * FROM home ORDER BY id ASC LIMIT 1');
  return row ? toHome(row) : null;
}

export async function getHomeById(id: number): Promise<Home | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<HomeRow>('SELECT * FROM home WHERE id = ?', [id]);
  return row ? toHome(row) : null;
}

export async function listHomes(): Promise<Home[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HomeRow>('SELECT * FROM home ORDER BY id ASC');
  return rows.map(toHome);
}
