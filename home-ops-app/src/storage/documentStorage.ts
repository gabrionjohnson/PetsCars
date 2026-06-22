import { Directory, File, Paths } from 'expo-file-system';

const DOCUMENTS_DIR_NAME = 'home-documents';

function getDocumentsDirectory(): Directory {
  const dir = new Directory(Paths.document, DOCUMENTS_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Copies a picked file into the app's permanent documents directory and returns its new File. */
export async function importDocumentFile(sourceUri: string, suggestedName: string): Promise<File> {
  const dir = getDocumentsDirectory();
  const safeName = `${Date.now()}-${suggestedName.replace(/[^a-z0-9.]+/gi, '-')}`;
  const source = new File(sourceUri);
  const dest = new File(dir, safeName);
  await source.copy(dest);
  return dest;
}
