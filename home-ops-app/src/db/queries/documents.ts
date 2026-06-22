import { getDatabase } from '../client';
import type { DocumentType, HomeDocument } from '../../types/models';

interface DocumentRow {
  id: number;
  home_id: number;
  title: string;
  type: DocumentType;
  uri: string;
  created_at: string;
}

function toDocument(row: DocumentRow): HomeDocument {
  return {
    id: row.id,
    homeId: row.home_id,
    title: row.title,
    type: row.type,
    uri: row.uri,
    createdAt: row.created_at,
  };
}

export interface CreateDocumentInput {
  homeId: number;
  title: string;
  type: DocumentType;
  uri: string;
}

export async function createDocument(input: CreateDocumentInput): Promise<HomeDocument> {
  const db = await getDatabase();
  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO document (home_id, title, type, uri, created_at) VALUES (?, ?, ?, ?, ?)`,
    [input.homeId, input.title, input.type, input.uri, createdAt]
  );
  const row = await db.getFirstAsync<DocumentRow>('SELECT * FROM document WHERE id = ?', [
    result.lastInsertRowId,
  ]);
  if (!row) throw new Error('Failed to create document');
  return toDocument(row);
}

export async function listDocumentsForHome(homeId: number): Promise<HomeDocument[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DocumentRow>(
    'SELECT * FROM document WHERE home_id = ? ORDER BY created_at DESC',
    [homeId]
  );
  return rows.map(toDocument);
}

export async function deleteDocument(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM document WHERE id = ?', [id]);
}
