import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { Home } from '../types/models';
import { listTasksForHome, listCompletionsForTask } from '../db/queries/tasks';
import { listAppliancesForHome } from '../db/queries/appliances';
import { listWarrantiesForAppliance } from '../db/queries/warranties';
import { listDocumentsForHome } from '../db/queries/documents';

export interface HomeHistoryExport {
  exportedAt: string;
  home: Home;
  tasks: Array<{
    title: string;
    category: string;
    cadence: string;
    completions: Array<{ completedAt: string; note: string | null }>;
  }>;
  appliances: Array<{
    name: string;
    type: string;
    brand: string | null;
    model: string | null;
    purchaseDate: string | null;
    warranties: Array<{ provider: string; expiresOn: string }>;
  }>;
  documents: Array<{ title: string; type: string; createdAt: string }>;
}

/** Assembles the full, timestamped home-history record from every table tied to a home. */
export async function buildHomeHistoryExport(home: Home): Promise<HomeHistoryExport> {
  const tasks = await listTasksForHome(home.id);
  const appliances = await listAppliancesForHome(home.id);
  const documents = await listDocumentsForHome(home.id);

  const taskHistory = await Promise.all(
    tasks.map(async (task) => ({
      title: task.title,
      category: task.category,
      cadence: task.defaultCadence,
      completions: (await listCompletionsForTask(task.id)).map((c) => ({
        completedAt: c.completedAt,
        note: c.note,
      })),
    }))
  );

  const applianceHistory = await Promise.all(
    appliances.map(async (appliance) => ({
      name: appliance.name,
      type: appliance.type,
      brand: appliance.brand,
      model: appliance.model,
      purchaseDate: appliance.purchaseDate,
      warranties: (await listWarrantiesForAppliance(appliance.id)).map((w) => ({
        provider: w.provider,
        expiresOn: w.expiresOn,
      })),
    }))
  );

  return {
    exportedAt: new Date().toISOString(),
    home,
    tasks: taskHistory,
    appliances: applianceHistory,
    documents: documents.map((d) => ({ title: d.title, type: d.type, createdAt: d.createdAt })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderHomeHistoryHtml(data: HomeHistoryExport): string {
  const taskRows = data.tasks
    .map(
      (task) => `
      <h3>${escapeHtml(task.title)} <span class="muted">(${escapeHtml(task.category)}, ${escapeHtml(task.cadence)})</span></h3>
      ${
        task.completions.length === 0
          ? '<p class="muted">No completions logged yet.</p>'
          : `<ul>${task.completions
              .map(
                (c) =>
                  `<li>${new Date(c.completedAt).toLocaleDateString()}${c.note ? ' — ' + escapeHtml(c.note) : ''}</li>`
              )
              .join('')}</ul>`
      }`
    )
    .join('');

  const applianceRows = data.appliances
    .map(
      (a) => `
      <h3>${escapeHtml(a.name)} <span class="muted">(${escapeHtml(a.type)})</span></h3>
      <p>${a.brand ? escapeHtml(a.brand) + ' ' : ''}${a.model ? escapeHtml(a.model) : ''}${a.purchaseDate ? ' — purchased ' + new Date(a.purchaseDate).toLocaleDateString() : ''}</p>
      ${
        a.warranties.length === 0
          ? ''
          : `<ul>${a.warranties.map((w) => `<li>${escapeHtml(w.provider)} warranty — expires ${new Date(w.expiresOn).toLocaleDateString()}</li>`).join('')}</ul>`
      }`
    )
    .join('');

  const documentRows = data.documents
    .map(
      (d) => `<li>${escapeHtml(d.title)} <span class="muted">(${escapeHtml(d.type)}, ${new Date(d.createdAt).toLocaleDateString()})</span></li>`
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Roboto, sans-serif; padding: 24px; color: #1a1a1a; }
          h1 { margin-bottom: 0; }
          .muted { color: #6b6b6b; font-size: 0.85em; }
          .disclaimer { margin-top: 32px; padding: 12px; background: #f4f4f4; border-radius: 8px; font-size: 0.8em; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.home.nickname)} — Home File</h1>
        <p class="muted">Exported ${new Date(data.exportedAt).toLocaleString()}</p>

        <h2>Maintenance history</h2>
        ${taskRows || '<p class="muted">No tasks yet.</p>'}

        <h2>Appliances & warranties</h2>
        ${applianceRows || '<p class="muted">No appliances added yet.</p>'}

        <h2>Documents</h2>
        <ul>${documentRows || '<li class="muted">No documents added yet.</li>'}</ul>

        <p class="disclaimer">
          This record reflects information you entered and is provided for your
          personal record-keeping. It is not a guarantee of safety, warranty
          coverage, or legal compliance — verify details with manufacturers,
          warranty providers, or your insurer as needed.
        </p>
      </body>
    </html>
  `;
}

/** Writes the home history as a JSON file to the document directory and returns its file URI. */
export async function exportHomeHistoryAsJson(home: Home): Promise<File> {
  const data = await buildHomeHistoryExport(home);
  const fileName = `${home.nickname.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-home-file.json`;
  const file = new File(Paths.document, fileName);
  file.write(JSON.stringify(data, null, 2));
  return file;
}

/** Renders the home history as a PDF via expo-print and returns its file URI. */
export async function exportHomeHistoryAsPdf(home: Home): Promise<File> {
  const data = await buildHomeHistoryExport(home);
  const html = renderHomeHistoryHtml(data);
  const { uri } = await Print.printToFileAsync({ html });
  return new File(uri);
}

export async function shareExportedFile(file: File): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return;
  await Sharing.shareAsync(file.uri);
}
