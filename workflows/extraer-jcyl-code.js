// Pegar en nodo "Extraer y comparar" (Run Once for All Items)
// Compara campo a campo (no el blob entero) y genera resumenDiff para el email.
const fila = $('Iterar convocatorias').item.json;
const url = String(fila.URL ?? '').trim();
const nombre = String(fila.Nombre ?? 'Convocatoria JCyL').trim();

const html =
  $input.first().json.data ??
  $input.first().json.body ??
  '';

const ENTITY_MAP = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ordm: 'º',
  oacute: 'ó',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  uacute: 'ú',
  ntilde: 'ñ',
};

/** Etiquetas volátiles / ruido: no disparan alerta semántica */
const IGNORE_LABELS = [
  /^contenido publicado( el)?$/i,
];

function decodeEntities(text) {
  let s = String(text);
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/&([a-zA-Z]+);/g, (entity, name) => {
    const decoded = ENTITY_MAP[name.toLowerCase()];
    return decoded ?? entity;
  });
  return s;
}

function stripHtml(text) {
  return decodeEntities(
    String(text)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function normKey(text) {
  return stripHtml(text)
    .replace(/:+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Etiqueta semántica: quita artículos y unifica variantes («Fecha de publicación» ≈ «Fecha publicación»). */
function normLabel(text) {
  let s = stripHtml(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/:+$/g, '')
    .trim();
  // Si viene «Sección — Campo», comparar por el campo (hoja)
  const parts = s.split(/\s*[—–\-]\s*/);
  s = (parts[parts.length - 1] || s).trim();
  s = s
    .replace(/\b(de|del|la|el|los|las|un|una)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function normVal(text) {
  return stripHtml(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function fingerprint(origen, etiqueta, valor) {
  return `${String(origen).toLowerCase()}|${normLabel(etiqueta)}|${normVal(valor)}`;
}

function shouldIgnoreLabel(etiqueta) {
  const k = normLabel(etiqueta);
  return IGNORE_LABELS.some((re) => re.test(k)) || IGNORE_LABELS.some((re) => re.test(normKey(etiqueta)));
}

function extractCamposFromHtml(sourceHtml, origen = 'principal') {
  const campos = [];
  const seen = new Set();

  const add = (etiqueta, valor, maxLen = 220) => {
    const e = stripHtml(etiqueta).replace(/:+$/, '').trim();
    let v = stripHtml(valor).replace(/^:+\s*/, '').trim();
    if (!e || !v) return;
    if (shouldIgnoreLabel(e)) return;
    if (v.length > maxLen) v = `${v.slice(0, maxLen)}…`;
    const fp = fingerprint(origen, e, v);
    if (seen.has(fp)) return;
    seen.add(fp);
    campos.push({
      origen,
      etiqueta: e,
      valor: v,
      key: fp,
      labelKey: normLabel(e),
    });
  };

  const sectionRegex = /<h2[^>]*>([^<]+)<\/h2>([\s\S]*?)(?=<h2|<\/main|$)/gi;
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(sourceHtml)) !== null) {
    const section = stripHtml(sectionMatch[1]);
    const block = sectionMatch[2];
    const regexHtml = /<strong>([^<:]+):<\/strong>\s*([^<]*)/gi;
    let match;
    while ((match = regexHtml.exec(block)) !== null) {
      if (/fecha|plazo|límite|publicación|información adicional/i.test(match[1])) {
        add(`${section} — ${match[1]}`, match[2]);
      }
    }
  }

  if (origen === 'principal' && campos.length === 0) {
    const regexHtml = /<strong>([^<:]+):<\/strong>\s*([^<]*)/gi;
    let match;
    while ((match = regexHtml.exec(sourceHtml)) !== null) {
      if (/fecha|plazo|límite|publicación|información adicional/i.test(match[1])) {
        add(match[1], match[2]);
      }
    }
  }

  if (origen === 'fase') {
    const regexH2 = /<h2[^>]*>([^<]+)<\/h2>\s*([\s\S]*?)(?=<h2|<\/main|$)/gi;
    let match;
    while ((match = regexH2.exec(sourceHtml)) !== null) {
      const titulo = stripHtml(match[1]);
      const cuerpo = match[2].replace(/<script[\s\S]*?<\/script>/gi, '');

      if (/convocatoria a la que pertenece/i.test(titulo)) continue;

      if (/contenido publicado el/i.test(titulo)) {
        // Ignorado por IGNORE_LABELS (ruido de página)
        continue;
      }

      if (/^fecha límite$/i.test(titulo) || /^información adicional$/i.test(titulo)) {
        add(titulo, cuerpo, 180);
      }
    }

    const textoPlano = stripHtml(sourceHtml);
    const ejercicioMatch = textoPlano.match(
      /Convocar[\s\S]{0,400}?(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2})/i,
    );
    if (ejercicioMatch) add('Fecha segundo ejercicio', ejercicioMatch[1], 80);
  }

  return campos;
}

function camposToEstado(campos) {
  if (!campos.length) return 'No se encontraron fechas';
  return [...campos]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((c) => `[${c.origen}] ${c.etiqueta}: ${c.valor}`)
    .join(' | ');
}

function parseEstadoToEntries(estadoText) {
  const entries = [];
  const seen = new Set();
  const raw = String(estadoText ?? '').trim();
  if (!raw || /^pendiente$/i.test(raw)) return entries;

  const chunks = raw.split(/\s*\|\|\s*|\s*\|\s*/);
  for (const chunk of chunks) {
    let s = chunk.trim();
    if (!s) continue;
    let origen = 'principal';
    const origenMatch = s.match(/^\[(principal|fase)\]\s*/i);
    if (origenMatch) {
      origen = origenMatch[1].toLowerCase();
      s = s.slice(origenMatch[0].length);
    }
    if (/^error al leer/i.test(s) || /^no se encontraron fechas/i.test(s)) continue;

    const idx = s.indexOf(':');
    if (idx < 0) continue;
    const etiqueta = s.slice(0, idx).trim();
    const valor = s.slice(idx + 1).trim();
    if (!etiqueta || !valor) continue;
    if (shouldIgnoreLabel(etiqueta)) continue;
    const fp = fingerprint(origen, etiqueta, valor);
    if (seen.has(fp)) continue;
    seen.add(fp);
    entries.push({
      origen,
      etiqueta,
      valor,
      key: fp,
      labelKey: normLabel(etiqueta),
      nvalor: normVal(valor),
    });
  }
  return entries;
}

function diffEntries(antes, ahora) {
  const afterFp = new Map(ahora.map((e) => [e.key, e]));
  const beforeFp = new Map(antes.map((e) => [e.key, e]));

  const removed = antes.filter((e) => !afterFp.has(e.key));
  const added = ahora.filter((e) => !beforeFp.has(e.key));

  const lines = [];
  const usedAdded = new Set();
  const usedRemoved = new Set();

  for (const a of removed) {
    const match = added.find(
      (b) =>
        b.labelKey === a.labelKey &&
        b.origen === a.origen &&
        !usedAdded.has(b.key),
    );
    if (match) {
      usedAdded.add(match.key);
      usedRemoved.add(a.key);
      lines.push(`~ [${match.origen}] ${a.etiqueta} → ${match.etiqueta}:`);
      lines.push(`    antes: ${a.valor}`);
      lines.push(`    ahora: ${match.valor}`);
    }
  }

  for (const a of removed) {
    if (!usedRemoved.has(a.key)) {
      lines.push(`- [${a.origen}] ${a.etiqueta}: ${a.valor}`);
    }
  }
  for (const b of added) {
    if (!usedAdded.has(b.key)) {
      lines.push(`+ [${b.origen}] ${b.etiqueta}: ${b.valor}`);
    }
  }
  return lines;
}

const campos = extractCamposFromHtml(html, 'principal');
let faseFetchFailed = false;

const adicionales = String(fila.URLs_Adicionales ?? fila['URLs_Adicionales'] ?? '')
  .split(';')
  .map((u) => u.trim())
  .filter(Boolean);

const httpRequest = this.helpers.httpRequest.bind(this.helpers);

for (const extraUrl of adicionales) {
  try {
    const extraHtml = await httpRequest({
      method: 'GET',
      url: extraUrl,
      returnFullResponse: false,
    });
    const body =
      typeof extraHtml === 'string'
        ? extraHtml
        : (extraHtml?.data ?? extraHtml?.body ?? String(extraHtml ?? ''));
    campos.push(...extractCamposFromHtml(body, 'fase'));
  } catch {
    faseFetchFailed = true;
  }
}

const estadoActual = camposToEstado(campos);
const estadoAnterior =
  fila.Ultima_Fecha_Extraida ??
  fila['Ultima_Fecha_Extraida'] ??
  'Pendiente';

const esBaseline =
  estadoAnterior === 'Pendiente' || String(estadoAnterior).trim() === '';

// Si falló una URL de fase, no alertar ni envenenar el snapshot con un falso "cambio"
if (faseFetchFailed && !esBaseline) {
  return [
    {
      json: {
        url,
        titulo: nombre,
        estadoActual: estadoAnterior,
        estadoAnterior,
        cambio: false,
        esBaseline: false,
        resumenDiff: '(omitido: error al leer URL adicional de fase)',
        hayDiffSemantico: false,
        ahora: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
        row_number: fila.row_number,
      },
    },
  ];
}

const mapAntes = parseEstadoToEntries(estadoAnterior);
const mapAhora = parseEstadoToEntries(estadoActual);
const diffLines = esBaseline ? [] : diffEntries(mapAntes, mapAhora);
const hayDiffSemantico = diffLines.length > 0;
const cambio = !esBaseline && hayDiffSemantico;
const resumenDiff = esBaseline
  ? '(baseline: primera captura, sin alerta)'
  : hayDiffSemantico
    ? diffLines.join('\n')
    : '(sin diferencias de campos tras normalizar)';

return [
  {
    json: {
      url,
      titulo: nombre,
      estadoActual,
      estadoAnterior,
      cambio,
      esBaseline,
      resumenDiff,
      hayDiffSemantico,
      ahora: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
      row_number: fila.row_number,
    },
  },
];
