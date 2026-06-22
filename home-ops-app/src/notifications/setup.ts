import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const MAINTENANCE_CHANNEL_ID = 'maintenance-reminders';
export const ALERTS_CHANNEL_ID = 'recall-warranty-alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(MAINTENANCE_CHANNEL_ID, {
    name: 'Maintenance reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
    name: 'Recall & warranty alerts',
    importance: Notifications.AndroidImportance.HIGH,
  });
}
