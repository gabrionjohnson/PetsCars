import type { SlimRecallRecord } from './recallMatching';
import { matchAppliancesToRecalls } from './recallMatching';
import { listAppliancesForHome } from '../db/queries/appliances';
import { recordNewRecallMatches, setRecallDatasetMeta } from '../db/queries/recalls';
import { sendRecallAlert } from '../notifications/scheduler';

export interface SlimRecallDataset {
  version: string;
  generatedAt: string;
  source: string;
  recalls: SlimRecallRecord[];
}

/**
 * URL of the slim, pre-normalized CPSC recall dataset published by the
 * weekly cron job (see scripts/recall-ingest). Configure via env at build
 * time; falls back to the bundled sample file for offline development.
 */
export const RECALL_DATASET_URL = process.env.EXPO_PUBLIC_RECALL_DATASET_URL ?? null;

export async function fetchRemoteRecallDataset(): Promise<SlimRecallDataset | null> {
  if (!RECALL_DATASET_URL) return null;
  try {
    const response = await fetch(RECALL_DATASET_URL);
    if (!response.ok) return null;
    return (await response.json()) as SlimRecallDataset;
  } catch {
    return null;
  }
}

/**
 * Runs the on-device recall match: downloads the slim dataset (or uses the
 * bundled sample in dev), matches every appliance in the home against it,
 * records genuinely new matches, and fires one push alert per new match.
 * No appliance data ever leaves the device — only the dataset is fetched.
 */
export async function syncAndMatchRecalls(homeId: number, dataset: SlimRecallDataset): Promise<number> {
  const appliances = await listAppliancesForHome(homeId);
  const matches = matchAppliancesToRecalls(
    appliances.map((a) => ({ id: a.id, name: a.name, type: a.type, brand: a.brand, model: a.model })),
    dataset.recalls
  );

  const newMatches = await recordNewRecallMatches(matches);
  await setRecallDatasetMeta(dataset.version);

  for (const match of newMatches) {
    const appliance = appliances.find((a) => a.id === match.applianceId);
    await sendRecallAlert(appliance?.name ?? 'your appliance', match);
  }

  return newMatches.length;
}
