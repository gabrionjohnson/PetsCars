import * as Notifications from 'expo-notifications';
import type { Task } from '../types/models';
import type { RecallMatch } from '../types/models';
import { getTaskNotificationId, setTaskNotificationId } from '../db/queries/tasks';
import { MAINTENANCE_CHANNEL_ID, ALERTS_CHANNEL_ID } from './setup';

/** Cancels any existing reminder for the task, then schedules a new one-off
 * notification at its next_due_date. Cadences are calendar-aware (seasonal,
 * annual-with-startMonth, etc.), so a one-off DATE trigger that gets
 * rescheduled on completion is more correct than a fixed repeat interval. */
export async function scheduleTaskReminder(task: Task): Promise<void> {
  const existingId = await getTaskNotificationId(task.id);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => undefined);
  }

  const dueDate = new Date(task.nextDueDate);
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: task.title,
      body: task.description,
      data: { taskId: task.id, kind: 'task_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: dueDate,
      channelId: MAINTENANCE_CHANNEL_ID,
    },
  });
  await setTaskNotificationId(task.id, identifier);
}

export async function cancelTaskReminder(task: Task): Promise<void> {
  const existingId = await getTaskNotificationId(task.id);
  if (!existingId) return;
  await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => undefined);
  await setTaskNotificationId(task.id, null);
}

/** Fires an immediate local notification for a newly-discovered recall match. */
export async function sendRecallAlert(applianceName: string, match: RecallMatch): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Recall: ${applianceName}`,
      body: match.recallTitle,
      data: { recallMatchId: match.id, kind: 'recall_alert' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      channelId: ALERTS_CHANNEL_ID,
    },
  });
}

/** Fires an immediate local notification for a warranty entering its alert window. */
export async function sendWarrantyAlert(
  applianceName: string,
  provider: string,
  daysRemaining: number
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Warranty expiring soon: ${applianceName}`,
      body: `Your ${provider} warranty expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
      data: { kind: 'warranty_alert' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      channelId: ALERTS_CHANNEL_ID,
    },
  });
}
