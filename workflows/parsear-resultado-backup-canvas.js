// Pegar en el nodo Code "Parsear resultado1" (o el que parsea stdout del .ps1).
// NO usa $('Rutas backup…'): todo viene del JSON del script → evita "Referenced node doesn't exist".

const out = $input.first().json;
const stdout = String(out.stdout ?? out ?? '');
const stderr = String(out.stderr ?? '');
const exitCode = Number(out.exitCode ?? 0);
const lines = stdout
  .split(/\r?\n/)
  .map((l) => l.replace(/^\uFEFF/, '').trim())
  .filter(Boolean);

let parsed = null;
for (let i = lines.length - 1; i >= 0; i--) {
  const line = lines[i];
  if (!line.startsWith('{')) continue;
  try {
    parsed = JSON.parse(line);
    break;
  } catch {
    /* siguiente */
  }
}

const zipPath = parsed?.zipPath ? String(parsed.zipPath).trim() : '';
const zipPathPosix = zipPath ? zipPath.replace(/\\/g, '/') : '';
const created = parsed?.status === 'created' && Boolean(zipPath);
const skipped = parsed?.status === 'skipped';
const failed =
  exitCode !== 0 ||
  !parsed ||
  !parsed.status ||
  (parsed.status !== 'created' && parsed.status !== 'skipped');

const deletedPaths = Array.isArray(parsed?.deletedPaths) ? parsed.deletedPaths : [];
const addedPaths = Array.isArray(parsed?.addedPaths) ? parsed.addedPaths : [];
const sourceEmptied = Boolean(parsed?.sourceEmptied);
const deletedCount = Number(parsed?.deletedCount ?? 0);
const addedCount = Number(parsed?.addedCount ?? 0);
const modifiedCount = Number(parsed?.modifiedCount ?? 0);
const previousFileCount = Number(parsed?.previousFileCount ?? 0);

let cambiosLine = 'sin detalle de diff';
if (sourceEmptied) {
  cambiosLine = `ORIGEN VACIADO: borrados ${deletedCount} (antes ${previousFileCount} → ahora 0)`;
} else if (deletedCount || addedCount || modifiedCount) {
  cambiosLine = `+${addedCount} ~${modifiedCount} -${deletedCount} (antes ${previousFileCount})`;
}

return [
  {
    json: {
      sourcePath: parsed?.sourcePath ?? '',
      backupDir: parsed?.backupDir ?? '',
      daysToKeep: Number(parsed?.daysToKeep ?? 7),
      modeRequested: parsed?.modeRequested ?? 'auto',
      mode: parsed?.mode ?? 'none',
      status: failed ? 'error' : (parsed?.status ?? 'error'),
      reason: parsed?.reason ?? (failed ? 'exec_or_parse_failed' : ''),
      message: parsed?.message ?? (stderr || stdout || 'Error en backup'),
      contentHash: parsed?.contentHash ?? '',
      fileCount: Number(parsed?.fileCount ?? 0),
      sourceFileCount: Number(parsed?.sourceFileCount ?? 0),
      previousFileCount,
      addedCount,
      modifiedCount,
      deletedCount,
      sourceEmptied,
      deletedPaths,
      addedPaths,
      cambiosLine,
      deletedPathsText: deletedPaths.length ? deletedPaths.join(', ') : '(ninguno)',
      zipPath,
      zipPathPosix,
      fileName: parsed?.fileName ?? (zipPath ? zipPath.split(/[/\\]/).pop() : ''),
      lastFullZip: parsed?.lastFullZip ?? '',
      created,
      skipped,
      failed,
      exitCode,
      stderr,
      chatId: String(parsed?.chatId ?? ''),
      ahora: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
    },
  },
];
