import { openDB, type IDBPDatabase } from 'idb'
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Operation types — each maps to a specific Supabase call on sync
// ---------------------------------------------------------------------------
export type QueuedOp =
  | { id: string; type: 'INSERT';           table: string; payload: Record<string, unknown>; createdAt: number }
  | { id: string; type: 'TASK_STEP';        taskId: string; content: string; createdAt: number }
  | { id: string; type: 'SESSION_NOTE';     sessionId: string; note: string; createdAt: number }
  | { id: string; type: 'UPDATE';           table: string; id_col: string; rowId: string; payload: Record<string, unknown>; createdAt: number }
  | { id: string; type: 'TRIP_STATUS';      tripId: string; tripType: 'errand' | 'nemt'; status: string; gpsLat?: number; gpsLng?: number; note?: string; photoUrl?: string; createdAt: number }

const DB_NAME    = 'pathway-offline'
const STORE_NAME = 'sync-queue'
const DB_VERSION = 3  // v3: TRIP_STATUS op type

let _db: IDBPDatabase | null = null

async function getDb() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        // v2: same store, new op types handled at flush time
      },
    })
  }
  return _db
}

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

export async function enqueueInsert(
  table:   string,
  payload: Record<string, unknown>,
): Promise<QueuedOp> {
  const db   = await getDb()
  const item: QueuedOp = { id: crypto.randomUUID(), type: 'INSERT', table, payload, createdAt: Date.now() }
  await db.put(STORE_NAME, item)
  return item
}

export async function enqueueTaskStep(taskId: string, content: string): Promise<QueuedOp> {
  const db   = await getDb()
  const item: QueuedOp = { id: crypto.randomUUID(), type: 'TASK_STEP', taskId, content, createdAt: Date.now() }
  await db.put(STORE_NAME, item)
  return item
}

export async function enqueueSessionNote(sessionId: string, note: string): Promise<QueuedOp> {
  const db   = await getDb()
  const item: QueuedOp = { id: crypto.randomUUID(), type: 'SESSION_NOTE', sessionId, note, createdAt: Date.now() }
  await db.put(STORE_NAME, item)
  return item
}

export async function enqueueTripStatus(
  tripId:    string,
  tripType:  'errand' | 'nemt',
  status:    string,
  opts?:     { gpsLat?: number; gpsLng?: number; note?: string; photoUrl?: string },
): Promise<QueuedOp> {
  const db = await getDb()
  const item: QueuedOp = {
    id: crypto.randomUUID(),
    type: 'TRIP_STATUS',
    tripId, tripType, status,
    gpsLat:   opts?.gpsLat,
    gpsLng:   opts?.gpsLng,
    note:     opts?.note,
    photoUrl: opts?.photoUrl,
    createdAt: Date.now(),
  }
  await db.put(STORE_NAME, item)
  return item
}

export async function dequeue(id: string): Promise<void> {
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

// ---------------------------------------------------------------------------
// Legacy shim — keep old enqueue() signature for the existing navigator dashboard
// ---------------------------------------------------------------------------
export async function enqueue(op: { table: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; payload: Record<string, unknown> }): Promise<QueuedOp> {
  return enqueueInsert(op.table, op.payload)
}

// ---------------------------------------------------------------------------
// Flush the offline queue — call on window 'online' event
// Returns { flushed, failed } counts.
// ---------------------------------------------------------------------------
export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  const ops = await getAllQueued()
  let flushed = 0, failed = 0

  for (const op of ops.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      await executeOp(op)
      await dequeue(op.id)
      flushed++
    } catch (err) {
      console.error('[offline-sync] failed to flush op', op.id, err)
      failed++
    }
  }

  return { flushed, failed }
}

async function executeOp(op: QueuedOp): Promise<void> {
  switch (op.type) {
    case 'INSERT': {
      const { error } = await supabase.from(op.table).insert(op.payload)
      if (error) throw error
      break
    }
    case 'UPDATE': {
      const { error } = await supabase.from(op.table).update(op.payload).eq(op.id_col, op.rowId)
      if (error) throw error
      break
    }
    case 'TASK_STEP': {
      const { error } = await supabase.rpc('append_task_step', {
        p_task_id: op.taskId,
        p_content:  op.content,
      })
      if (error) throw error
      break
    }
    case 'TRIP_STATUS': {
      // Calls the Edge Function which handles auth, audit log, and SMS
      const { error } = await supabase.functions.invoke('update-trip-status', {
        body: {
          trip_id:   op.tripId,
          trip_type: op.tripType,
          status:    op.status,
          gps_lat:   op.gpsLat,
          gps_lng:   op.gpsLng,
          note:      op.note,
          photo_url: op.photoUrl,
        },
      })
      if (error) throw error
      break
    }
    case 'SESSION_NOTE': {
      // Append note to sessions.notes (separator: '\n---\n')
      const { data: sess } = await supabase
        .from('sessions')
        .select('notes')
        .eq('id', op.sessionId)
        .single()
      const current = sess?.notes ?? ''
      const updated = current ? `${current}\n---\n${op.note}` : op.note
      const { error } = await supabase
        .from('sessions')
        .update({ notes: updated })
        .eq('id', op.sessionId)
      if (error) throw error
      break
    }
  }
}
