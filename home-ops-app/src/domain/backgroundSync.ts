import { isWarrantyExpiringSoon, daysUntilExpiry, getWarrantyAlertLeadDays } from './warranty';
import { listUnalertedWarrantiesForHome, markWarrantyAlerted } from '../db/queries/warranties';
import { sendWarrantyAlert } from '../notifications/scheduler';
import { fetchRemoteRecallDataset, syncAndMatchRecalls } from './recallSync';
import type { SlimRecallDataset } from './recallSync';
import { SAMPLE_RECALL_DATASET } from '../data/sampleRecallDataset';

/** Checks warranties for a home and fires (and marks as sent) one alert per
 * warranty that has newly entered its expiration lead window. */
export async function checkWarrantyAlerts(homeId: number, now: Date = new Date()): Promise<number> {
  const candidates = await listUnalertedWarrantiesForHome(homeId);
  const leadDays = await getWarrantyAlertLeadDays();
  let alerted = 0;
  for (const warranty of candidates) {
    const expiresOn = new Date(warranty.expiresOn);
    if (isWarrantyExpiringSoon(expiresOn, now, leadDays)) {
      await sendWarrantyAlert(warranty.applianceName, warranty.provider, daysUntilExpiry(expiresOn, now));
      await markWarrantyAlerted(warranty.id, now);
      alerted += 1;
    }
  }
  return alerted;
}

/**
 * The single entry point the app calls on a schedule (app foreground +
 * a background task, see notifications/backgroundTask.ts) to run both
 * passive watch-layer checks: recalls and warranties.
 */
export async function runBackgroundChecks(homeId: number): Promise<{ newRecalls: number; warrantyAlerts: number }> {
  const dataset: SlimRecallDataset = (await fetchRemoteRecallDataset()) ?? SAMPLE_RECALL_DATASET;
  const newRecalls = await syncAndMatchRecalls(homeId, dataset);
  const warrantyAlerts = await checkWarrantyAlerts(homeId);
  return { newRecalls, warrantyAlerts };
}
