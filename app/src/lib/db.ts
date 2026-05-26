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
  // Phase 4 NEMT: signature PNG stored to Supabase Storage (offline → upload on reconnect)
  | { id: string; type: 'NEMT_SIGNATURE';   tripId: string; signatureType: 'pickup' | 'dropoff'; dataUrl: string; createdAt: number }
  // Phase 4 NEMT: pre-trip checklist answers stored offline
  | { id: string; type: 'NEMT_CHECKLIST';   tripId: string; answers: Record<string, boolean>; createdAt: number }

const DB_NAME    = 'pathway-offline'
const STORE_NAME = 'sync-queue'
const DB_VERSION = 4  // v4: NEMT_SIGNATURE, NEMT_CHECKLIST op types

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

export async function enqueueNemtSignature(
  tripId:        string,
  signatureType: 'pickup' | 'dropoff',
  dataUrl:       string,
): Promise<QueuedOp> {
  const db = await getDb()
  const item: QueuedOp = {
    id: crypto.randomUUID(),
    type: 'NEMT_SIGNATURE',
    tripId, signatureType, dataUrl,
    createdAt: Date.now(),
  }
  await db.put(STORE_NAME, item)
  return item
}

export async function enqueueNemtChecklist(
  tripId:  string,
  answers: Record<string, boolean>,
): Promise<QueuedOp> {
  const db = await getDb()
  const item: QueuedOp = {
    id: crypto.randomUUID(),
    type: 'NEMT_CHECKLIST',
    tripId, answers,
    createdAt: Date.now(),
  }
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
    case 'NEMT_SIGNATURE': {
      // Convert data URL → Blob and upload to nemt-signatures/{tripId}/{type}.png
      const res  = await fetch(op.dataUrl)
      const blob = await res.blob()
      const path = `${op.tripId}/${op.signatureType}.png`
      const { error: upErr } = await supabase.storage
        .from('nemt-signatures')
        .upload(path, blob, { contentType: 'image/png', upsert: false })
      if (upErr && !upErr.message.includes('already exists')) throw upErr

      // Update the correct column on nemt_trips
      const col = op.signatureType === 'pickup' ? 'pickup_signature_url' : 'dropoff_signature_url'
      const { error: dbErr } = await supabase
        .from('nemt_trips')
        .update({ [col]: path, updated_at: new Date().toISOString() })
        .eq('id', op.tripId)
      if (dbErr) throw dbErr
      break
    }
    case 'NEMT_CHECKLIST': {
      // Mark pre-trip checklist complete on nemt_trips
      const { error } = await supabase
        .from('nemt_trips')
        .update({
          pre_trip_checklist_completed: true,
          pre_trip_checklist_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', op.tripId)
      if (error) throw error
      break
    }
  }
}
