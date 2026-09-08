/**
 * Code node: "Seleccionar retencion Drive"
 * Entrada: items del listado Google Drive (fileFolder search) en la carpeta de backups.
 * Salida: 1 item con resumen + lista `toDelete` (id/name) segun keep-latest.
 *
 * Reglas (igual que rotar-backups.ps1):
 * - max 1 full, 1 diff, 1 incr
 * - tras full: borrar todos diff e incr (salvo el ZIP recien subido si fuera de ese tipo)
 * - tras diff: borrar todos incr
 * - no borrar el fichero recien subido (keepId)
 */
const keepId = String($('Subir a Google Drive').item.json.id || '');
const mode = String($('Parsear resultado').item.json.mode || '');
const fileName = String($('Parsear resultado').item.json.fileName || '');

const files = $input.all().map((i) => ({
  id: String(i.json.id || i.json.fileId || ''),
  name: String(i.json.name || ''),
  modified: i.json.modifiedTime || i.json.createdTime || '',
})).filter((f) => f.id && f.name && /^backup_(full|diff|incr)_/i.test(f.name));

function kind(name) {
  if (/^backup_full_/i.test(name)) return 'full';
  if (/^backup_diff_/i.test(name)) return 'differential';
  if (/^backup_incr_/i.test(name)) return 'incremental';
  return 'other';
}

const byKind = { full: [], differential: [], incremental: [], other: [] };
for (const f of files) {
  byKind[kind(f.name)].push(f);
}
for (const k of Object.keys(byKind)) {
  byKind[k].sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}

const toDeleteMap = new Map();
function markDelete(list) {
  for (const f of list) {
    if (f.id === keepId) continue;
    toDeleteMap.set(f.id, f);
  }
}

// Cascada
if (mode === 'full') {
  markDelete(byKind.differential);
  markDelete(byKind.incremental);
} else if (mode === 'differential') {
  markDelete(byKind.incremental);
}

// Max 1 por tipo: conservar el mas reciente (o el recien subido si esta en el grupo)
for (const k of ['full', 'differential', 'incremental']) {
  const list = byKind[k];
  if (list.length <= 1) continue;
  const keep = list.find((f) => f.id === keepId) || list[0];
  for (const f of list) {
    if (f.id !== keep.id) toDeleteMap.set(f.id, f);
  }
}

const toDelete = [...toDeleteMap.values()];
const driveRetention =
  toDelete.length === 0
    ? `Drive retencion: nada que borrar (keep ${fileName || keepId}; mode=${mode}). Max 1 full/diff/incr.`
    : `Drive retencion: se eliminaran ${toDelete.length} ZIP(s) antiguos: ${toDelete.map((f) => f.name).join(', ')}. Max 1 full/diff/incr; mode=${mode}.`;

return [
  {
    json: {
      keepId,
      mode,
      fileName,
      driveRetention,
      toDelete,
      deleteCount: toDelete.length,
    },
  },
];
