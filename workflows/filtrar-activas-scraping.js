// Pegar en nodo "Filtrar activas" (Run Once for All Items)
// Acepta columnas con nombre (URL, CSS_Selector…) o letras A–I si Sheets no lee encabezados.

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return row[k];
    }
  }
  const entries = Object.entries(row);
  for (const want of keys) {
    const found = entries.find(([k]) => k.toLowerCase() === String(want).toLowerCase());
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return found[1];
    }
  }
  return '';
}

function normalize(row) {
  return {
    ...row,
    Nombre: String(pick(row, 'Nombre', 'A', 'nombre') || 'Página').trim(),
    URL: String(pick(row, 'URL', 'B', 'url')).trim(),
    CSS_Selector: String(pick(row, 'CSS_Selector', 'C', 'css_selector')).trim(),
    Condicion: String(pick(row, 'Condicion', 'D', 'condicion') || 'changed').trim(),
    Valor_Umbral: String(pick(row, 'Valor_Umbral', 'E', 'valor_umbral')).trim(),
    Render_JS: String(pick(row, 'Render_JS', 'F', 'render_js') || 'NO').trim(),
    Activo: String(pick(row, 'Activo', 'G', 'activo') || 'SI').trim(),
    Ultimo_Valor: String(pick(row, 'Ultimo_Valor', 'H', 'ultimo_valor')).trim(),
    Ultima_Comprobacion: String(pick(row, 'Ultima_Comprobacion', 'I', 'ultima_comprobacion')).trim(),
    row_number: row.row_number,
  };
}

const rows = $input.all().map((item) => normalize(item.json));

const activas = rows.filter((row) => {
  if (!row.URL) return false;
  if (/^url$/i.test(row.URL)) return false; // fila de encabezados leída como dato
  if (!row.CSS_Selector) return false;
  if (/^css[_ ]?selector$/i.test(row.CSS_Selector)) return false;
  const activo = row.Activo.toUpperCase();
  return activo === 'SI' || activo === 'SÍ' || activo === 'TRUE' || activo === '1' || activo === 'ACTIVO';
});

if (activas.length === 0) {
  const muestra = $input.first()?.json ?? {};
  const claves = Object.keys(muestra).join(', ') || '(sin datos)';
  throw new Error(
    `No hay URLs activas. Claves recibidas: ${claves}. ` +
      'Añade al menos una fila de datos (fila 2+) con URL, CSS_Selector y Activo=SI. ' +
      'Fila 1 = encabezados.',
  );
}

return activas.map((row) => ({ json: row }));
