export interface SlimRecallRecord {
  id: string;
  title: string;
  url: string;
  hazard: string;
  recallDate: string;
  /** Lowercased keywords pulled from product name, brand/manufacturer, and product type. */
  keywords: string[];
}

export interface MatchableAppliance {
  id: number;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
}

export interface RecallMatchResult {
  applianceId: number;
  recall: SlimRecallRecord;
  matchedOn: string;
}

const STOPWORDS = new Set([
  'the', 'and', 'or', 'with', 'for', 'a', 'an', 'of', 'in', 'on', 'to', 'inc', 'co', 'llc', 'corp',
]);

/**
 * Splits text into lowercase, de-duplicated, stopword-free tokens for keyword
 * matching. Mirrored in scripts/recall-ingest/tokenize.mjs, which runs
 * outside the app bundle under plain Node — keep both in sync.
 */
export function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return Array.from(new Set(tokens));
}

/**
 * Matches an appliance against the slim recall dataset using keyword overlap
 * on product name / brand / type (intentionally NOT UPC, which CPSC data
 * rarely includes reliably). An appliance's brand must match a recall keyword,
 * AND at least one of its type/name keywords must also match, to avoid
 * false positives from common brand names alone matching unrelated hazards.
 */
export function matchApplianceToRecalls(
  appliance: MatchableAppliance,
  recalls: SlimRecallRecord[]
): RecallMatchResult[] {
  const brandTokens = appliance.brand ? tokenize(appliance.brand) : [];
  const productTokens = tokenize(`${appliance.name} ${appliance.type} ${appliance.model ?? ''}`);

  if (brandTokens.length === 0 || productTokens.length === 0) {
    return [];
  }

  const results: RecallMatchResult[] = [];
  for (const recall of recalls) {
    const recallKeywordSet = new Set(recall.keywords);
    const brandMatch = brandTokens.find((token) => recallKeywordSet.has(token));
    if (!brandMatch) continue;

    const productMatch = productTokens.find((token) => recallKeywordSet.has(token));
    if (!productMatch) continue;

    results.push({
      applianceId: appliance.id,
      recall,
      matchedOn: `${brandMatch}, ${productMatch}`,
    });
  }
  return results;
}

export function matchAppliancesToRecalls(
  appliances: MatchableAppliance[],
  recalls: SlimRecallRecord[]
): RecallMatchResult[] {
  return appliances.flatMap((appliance) => matchApplianceToRecalls(appliance, recalls));
}
