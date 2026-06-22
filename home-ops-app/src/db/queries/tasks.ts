import { getDatabase } from '../client';
import type { Task, TaskCadence, TaskCompletion, TaskSource } from '../../types/models';
import { computeNextDueDate, selectSeedTasks } from '../../domain/scheduleEngine';
import { TASK_LIBRARY } from '../../data/taskLibrary';
import type { Home } from '../../types/models';

interface TaskRow {
  id: number;
  home_id: number;
  title: string;
  description: string;
  category: string;
  default_cadence: TaskCadence;
  next_due_date: string;
  is_active: number;
  source: TaskSource;
  notification_id: string | null;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    homeId: row.home_id,
    title: row.title,
    description: row.description,
    category: row.category,
    defaultCadence: row.default_cadence,
    nextDueDate: row.next_due_date,
    isActive: row.is_active === 1,
    source: row.source,
  };
}

interface TaskCompletionRow {
  id: number;
  task_id: number;
  completed_at: string;
  note: string | null;
  photo_uri: string | null;
}

function toCompletion(row: TaskCompletionRow): TaskCompletion {
  return {
    id: row.id,
    taskId: row.task_id,
    completedAt: row.completed_at,
    note: row.note,
    photoUri: row.photo_uri,
  };
}

/** Seeds a freshly-created home with the matching starter task library. */
export async function seedTasksForHome(home: Home, now: Date = new Date()): Promise<Task[]> {
  const db = await getDatabase();
  const seedTasks = selectSeedTasks(TASK_LIBRARY, home.homeAgeBand, home.climateZone);
  const created: Task[] = [];
  for (const seed of seedTasks) {
    const nextDueDate = computeNextDueDate(seed.defaultCadence, now, seed.startMonth);
    const result = await db.runAsync(
      `INSERT INTO task (home_id, title, description, category, default_cadence, next_due_date, is_active, source)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'library')`,
      [home.id, seed.title, seed.description, seed.category, seed.defaultCadence, nextDueDate.toISOString()]
    );
    const row = await db.getFirstAsync<TaskRow>('SELECT * FROM task WHERE id = ?', [
      result.lastInsertRowId,
    ]);
    if (row) created.push(toTask(row));
  }
  return created;
}

export interface CreateCustomTaskInput {
  homeId: number;
  title: string;
  description: string;
  category: string;
  defaultCadence: TaskCadence;
  startDate?: Date;
}

export async function createCustomTask(input: CreateCustomTaskInput): Promise<Task> {
  const db = await getDatabase();
  const nextDueDate = input.startDate ?? new Date();
  const result = await db.runAsync(
    `INSERT INTO task (home_id, title, description, category, default_cadence, next_due_date, is_active, source)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'custom')`,
    [
      input.homeId,
      input.title,
      input.description,
      input.category,
      input.defaultCadence,
      nextDueDate.toISOString(),
    ]
  );
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM task WHERE id = ?', [
    result.lastInsertRowId,
  ]);
  if (!row) throw new Error('Failed to create task');
  return toTask(row);
}

export async function listTasksForHome(homeId: number): Promise<Task[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM task WHERE home_id = ? ORDER BY next_due_date ASC',
    [homeId]
  );
  return rows.map(toTask);
}

export async function getTaskById(id: number): Promise<Task | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM task WHERE id = ?', [id]);
  return row ? toTask(row) : null;
}

export async function setTaskActive(taskId: number, isActive: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE task SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, taskId]);
}

export async function updateTaskCadence(taskId: number, cadence: TaskCadence): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE task SET default_cadence = ? WHERE id = ?', [cadence, taskId]);
}

export async function setTaskNotificationId(
  taskId: number,
  notificationId: string | null
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE task SET notification_id = ? WHERE id = ?', [notificationId, taskId]);
}

export async function getTaskNotificationId(taskId: number): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ notification_id: string | null }>(
    'SELECT notification_id FROM task WHERE id = ?',
    [taskId]
  );
  return row?.notification_id ?? null;
}

/** Marks a task complete, logs the completion, and advances next_due_date. */
export async function completeTask(
  taskId: number,
  options: { note?: string; photoUri?: string; completedAt?: Date } = {}
): Promise<Task> {
  const db = await getDatabase();
  const task = await getTaskById(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const completedAt = options.completedAt ?? new Date();
  await db.runAsync(
    'INSERT INTO task_completion (task_id, completed_at, note, photo_uri) VALUES (?, ?, ?, ?)',
    [taskId, completedAt.toISOString(), options.note ?? null, options.photoUri ?? null]
  );

  const nextDueDate = computeNextDueDate(task.defaultCadence, completedAt);
  await db.runAsync('UPDATE task SET next_due_date = ? WHERE id = ?', [
    nextDueDate.toISOString(),
    taskId,
  ]);

  const updated = await getTaskById(taskId);
  if (!updated) throw new Error(`Task ${taskId} not found after completion`);
  return updated;
}

export async function listCompletionsForTask(taskId: number): Promise<TaskCompletion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TaskCompletionRow>(
    'SELECT * FROM task_completion WHERE task_id = ? ORDER BY completed_at DESC',
    [taskId]
  );
  return rows.map(toCompletion);
}

export async function listRecentCompletionsForHome(
  homeId: number,
  limit = 20
): Promise<(TaskCompletion & { taskTitle: string })[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TaskCompletionRow & { task_title: string }>(
    `SELECT tc.*, t.title as task_title
     FROM task_completion tc
     JOIN task t ON t.id = tc.task_id
     WHERE t.home_id = ?
     ORDER BY tc.completed_at DESC
     LIMIT ?`,
    [homeId, limit]
  );
  return rows.map((row) => ({ ...toCompletion(row), taskTitle: row.task_title }));
}
