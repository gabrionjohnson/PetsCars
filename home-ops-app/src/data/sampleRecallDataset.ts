import type { SlimRecallDataset } from '../domain/recallSync';
import raw from './sampleRecallDataset.json';

/**
 * Bundled fixture so the app's recall watch-layer works fully offline in
 * dev/demo builds before a real EXPO_PUBLIC_RECALL_DATASET_URL is wired up.
 * Contains fictional placeholder recalls, not real CPSC data — see the
 * dataset's own `source` field.
 */
export const SAMPLE_RECALL_DATASET: SlimRecallDataset = raw as SlimRecallDataset;
