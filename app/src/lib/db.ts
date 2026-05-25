import { openDB, type IDBPDatabase } from 'idb'

interface QueuedOp {
  id:        string
  table:     string
  op:        'INSERT' | 'UPDATE' | 'DELETE'
  payload:   Record<string, unknown>
  createdAt: number
}

const DB_NAME    = 'pathway-offline'
const STORE_NAME = 'sync-queue'
const DB_VERSION = 1

let _db: IDBPDatabase | null = null

async function getDb() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      },
    })
  }
  return _db
}

export async function enqueue(op: Omit<QueuedOp, 'id' | 'createdAt'>) {
  const db = await getDb()
  const item: QueuedOp = { ...op, id: crypto.randomUUID(), createdAt: Date.now() }
  await db.put(STORE_NAME, item)
  return item
}

export async function dequeue(id: string) {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}

export async function getAllQueued(): Promise<QueuedOp[]> {
  const db = await getDb()
  return db.getAll(STORE_NAME)
}

export async function queueCount(): Promise<number> {
  const db = await getDb()
  return db.count(STORE_NAME)
}
