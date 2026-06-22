import { getAppSetting, setAppSetting } from '../db/queries/appSettings';

export const DEFAULT_WARRANTY_ALERT_LEAD_DAYS = 30;
const WARRANTY_ALERT_LEAD_DAYS_SETTING_KEY = 'warrantyAlertLeadDays';

export async function getWarrantyAlertLeadDays(): Promise<number> {
  const value = await getAppSetting(WARRANTY_ALERT_LEAD_DAYS_SETTING_KEY);
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_WARRANTY_ALERT_LEAD_DAYS : parsed;
}

export async function setWarrantyAlertLeadDays(days: number): Promise<void> {
  await setAppSetting(WARRANTY_ALERT_LEAD_DAYS_SETTING_KEY, String(days));
}

/** Returns true when `expiresOn` falls within `leadDays` of `now` and hasn't already passed. */
export function isWarrantyExpiringSoon(
  expiresOn: Date,
  now: Date = new Date(),
  leadDays: number = DEFAULT_WARRANTY_ALERT_LEAD_DAYS
): boolean {
  const alertDate = new Date(expiresOn.getTime());
  alertDate.setDate(alertDate.getDate() - leadDays);
  return now.getTime() >= alertDate.getTime() && now.getTime() < expiresOn.getTime();
}

export function isWarrantyExpired(expiresOn: Date, now: Date = new Date()): boolean {
  return expiresOn.getTime() < now.getTime();
}

export function daysUntilExpiry(expiresOn: Date, now: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((expiresOn.getTime() - now.getTime()) / msPerDay);
}
