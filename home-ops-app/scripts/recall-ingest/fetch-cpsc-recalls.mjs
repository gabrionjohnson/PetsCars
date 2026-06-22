#!/usr/bin/env node
/**
 * Weekly recall-ingest job.
 *
 * Pulls recall records from the CPSC SaferProducts.gov REST API, slims each
 * record down to the fields the app needs for on-device keyword matching,
 * and writes the result to a single JSON file. Run this from a scheduled
 * job (e.g. GitHub Actions cron, or any serverless cron) and publish the
 * output file to a CDN/object store the app downloads from. No user data
 * is ever sent to CPSC — this is a read-only, anonymous fetch.
 *
 * Usage:
 *   node scripts/recall-ingest/fetch-cpsc-recalls.mjs [--years=5] [--out=path]
 *
 * CPSC API reference: https://www.saferproducts.gov/RestWebServices/Recall?format=json
 * Filter fields used: ProductName, RecallDescription, RecallDateStart, RecallDateEnd.
 */
import { writeFileSync } from 'node:fs';
import { tokenize } from './tokenize.mjs';

const CPSC_BASE_URL = 'https://www.saferproducts.gov/RestWebServices/Recall';
const DEFAULT_LOOKBACK_YEARS = 5;
const CHUNK_MONTHS = 3;

function parseArgs(argv) {
  const args = { years: DEFAULT_LOOKBACK_YEARS, out: 'data/recalls-slim.json' };
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'years') args.years = Number(value);
    if (key === 'out') args.out = value;
  }
  return args;
}

function toDateParam(date) {
  return date.toISOString().slice(0, 10);
}

/** CPSC returns large result sets for wide date ranges, so we page through
 * the lookback window in fixed-size month chunks rather than one request. */
function buildDateChunks(years) {
  const chunks = [];
  const end = new Date();
  let chunkEnd = new Date(end);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);

  while (chunkEnd > start) {
    const chunkStart = new Date(chunkEnd);
    chunkStart.setMonth(chunkStart.getMonth() - CHUNK_MONTHS);
    const clampedStart = chunkStart < start ? start : chunkStart;
    chunks.push({ start: clampedStart, end: chunkEnd });
    chunkEnd = clampedStart;
  }
  return chunks;
}

async function fetchChunk(start, end) {
  const url = `${CPSC_BASE_URL}?format=json&RecallDateStart=${toDateParam(start)}&RecallDateEnd=${toDateParam(end)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CPSC request failed (${response.status}) for ${url}`);
  }
  const body = await response.json();
  return Array.isArray(body) ? body : [];
}

/** Normalizes one raw CPSC recall record into the app's slim schema. The
 * live API's exact casing/shape isn't formally documented, so field access
 * is defensive (several fallbacks) rather than assuming one fixed shape. */
function slimRecord(raw) {
  const id = String(raw.RecallID ?? raw.RecallNumber ?? raw.id ?? '');
  const title = raw.Title ?? raw.RecallDescription ?? raw.Description ?? 'Untitled recall';
  const url = raw.URL ?? raw.RecallURL ?? (id ? `https://www.saferproducts.gov/RestWebServices/Recall?RecallID=${id}` : '');
  const recallDate = raw.RecallDate ?? raw.LastPublishDate ?? null;

  const products = Array.isArray(raw.Products) ? raw.Products : [];
  const manufacturers = Array.isArray(raw.Manufacturers) ? raw.Manufacturers : [];
  const importers = Array.isArray(raw.Importers) ? raw.Importers : [];
  const hazards = Array.isArray(raw.Hazards) ? raw.Hazards : [];

  const productText = products
    .map((p) => [p.Name, p.Model, p.Type].filter(Boolean).join(' '))
    .join(' ');
  const brandText = [...manufacturers, ...importers].map((m) => m.Name).filter(Boolean).join(' ');
  const hazardText = hazards.map((h) => h.Name).filter(Boolean).join('; ') || 'Hazard not specified';

  const keywords = Array.from(new Set([...tokenize(productText), ...tokenize(brandText)]));

  return {
    id,
    title: String(title).trim(),
    url: String(url).trim(),
    hazard: hazardText,
    recallDate: recallDate ? new Date(recallDate).toISOString() : new Date().toISOString(),
    keywords,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const chunks = buildDateChunks(args.years);

  const recordsById = new Map();
  for (const chunk of chunks) {
    const rawRecords = await fetchChunk(chunk.start, chunk.end);
    for (const raw of rawRecords) {
      const slim = slimRecord(raw);
      if (slim.id && slim.keywords.length > 0) {
        recordsById.set(slim.id, slim);
      }
    }
  }

  const dataset = {
    version: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    source: 'U.S. CPSC SaferProducts.gov — recall data is provided as-is and may not be exhaustive.',
    recalls: Array.from(recordsById.values()),
  };

  writeFileSync(args.out, JSON.stringify(dataset, null, 2));
  console.log(`Wrote ${dataset.recalls.length} recalls to ${args.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
