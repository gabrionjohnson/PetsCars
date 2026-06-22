export type HomeAgeBand = 'new_0_5' | 'young_6_15' | 'established_16_30' | 'older_31_plus';

export type ClimateZone =
  | 'cold'
  | 'mixed_humid'
  | 'mixed_dry'
  | 'hot_humid'
  | 'hot_dry'
  | 'marine';

export type TaskCadence = 'monthly' | 'every_90_days' | 'seasonal' | 'annual' | 'every_3_years';

export type TaskSource = 'library' | 'custom';

export interface Home {
  id: number;
  nickname: string;
  address: string | null;
  yearBuilt: number | null;
  homeAgeBand: HomeAgeBand;
  climateZone: ClimateZone;
  createdAt: string;
}

export interface Task {
  id: number;
  homeId: number;
  title: string;
  description: string;
  category: string;
  defaultCadence: TaskCadence;
  nextDueDate: string;
  isActive: boolean;
  source: TaskSource;
}

export interface TaskCompletion {
  id: number;
  taskId: number;
  completedAt: string;
  note: string | null;
  photoUri: string | null;
}

export interface Appliance {
  id: number;
  homeId: number;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  purchaseDate: string | null;
  notes: string | null;
}

export interface Warranty {
  id: number;
  applianceId: number;
  provider: string;
  expiresOn: string;
  documentUri: string | null;
}

export type DocumentType = 'receipt' | 'manual' | 'photo' | 'other';

export interface HomeDocument {
  id: number;
  homeId: number;
  title: string;
  type: DocumentType;
  uri: string;
  createdAt: string;
}

export interface RecallDatasetMeta {
  lastSyncedAt: string | null;
  version: string | null;
}

export type RecallMatchStatus = 'new' | 'seen' | 'dismissed';

export interface RecallMatch {
  id: number;
  applianceId: number;
  recallId: string;
  recallTitle: string;
  recallUrl: string;
  hazard: string;
  matchedOn: string;
  status: RecallMatchStatus;
  createdAt: string;
}
