// Pegar en nodo "Extraer y comparar" (Run Once for All Items)
// Compara campo a campo (huellas normalizadas) y genera resumenDiff para el email.
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

const IGNORE_LABELS = [/^contenido publicado( el)?$/i];

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

function normLabel(text) {
  let s = stripHtml(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/:+$/g, '')
    .trim();
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

/** Ruido típico del HTML JCyL (enlaces "Incluye", textos vacíos). */
function isJunkValor(etiqueta, valor) {
  const l = normLabel(etiqueta);
  const v = normVal(valor);
  if (!v) return true;
  if (/^incluye:?$/.test(v)) return true;
  if (/^informacion adicional$/.test(l) && (v.length < 25 || /^incluye\b/.test(v))) return true;
  return false;
}

function extractCamposFromHtml(sourceHtml, origen = 'principal') {
  const campos = [];
  const seen = new Set();

  const add = (etiqueta, valor, maxLen = 220) => {
    const e = stripHtml(etiqueta).replace(/:+$/, '').trim();
    let v = stripHtml(valor).replace(/^:+\s*/, '').trim();
    if (!e || !v) return;
    if (shouldIgnoreLabel(e)) return;
    if (isJunkValor(e, v)) return;
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
      if (/contenido publicado el/i.test(titulo)) continue;

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
    if (isJunkValor(etiqueta, valor)) continue;
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
let faseFetchedOk = false;
const faseCampos = [];

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
    faseFetchedOk = true;
    faseCampos.push(...extractCamposFromHtml(body, 'fase'));
  } catch {
    faseFetchFailed = true;
  }
}

campos.push(...faseCampos);

const estadoAnterior =
  fila.Ultima_Fecha_Extraida ??
  fila['Ultima_Fecha_Extraida'] ??
  'Pendiente';

const esBaseline =
  estadoAnterior === 'Pendiente' || String(estadoAnterior).trim() === '';

const prevEntries = parseEstadoToEntries(estadoAnterior);
const prevFase = prevEntries.filter((e) => e.origen === 'fase');

// Si había datos de fase y esta vez no salió ninguno (fallo HTTP o regex vacío),
// no borramos el snapshot de fase ni alertamos por "desaparición".
let faseCarriedForward = false;
if (!esBaseline && prevFase.length > 0 && faseCampos.length === 0) {
  faseCarriedForward = true;
  for (const e of prevFase) {
    if (campos.some((c) => c.key === e.key)) continue;
    campos.push({
      origen: e.origen,
      etiqueta: e.etiqueta,
      valor: e.valor,
      key: e.key,
      labelKey: e.labelKey,
    });
  }
}

if (faseFetchFailed && !esBaseline && !faseCarriedForward) {
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

const estadoActual = camposToEstado(campos);
const mapAntes = prevEntries;
const mapAhora = parseEstadoToEntries(estadoActual);
let diffLines = esBaseline ? [] : diffEntries(mapAntes, mapAhora);

// Si solo "cambiaron" cosas por carry-forward/ruido ya filtrado, no alertar
if (faseCarriedForward) {
  diffLines = diffLines.filter((line) => !/\[fase\]/i.test(line));
}

const hayDiffSemantico = diffLines.length > 0;
const meaningfulDiff = diffLines.filter((l) => !/^\s{2,}/.test(l));
const onlyFaseBootstrap =
  !esBaseline &&
  prevFase.length === 0 &&
  meaningfulDiff.length > 0 &&
  meaningfulDiff.every((l) => /^\+\s*\[fase\]/i.test(l));

// Primera vez que entra info de fase en el snapshot (o se recupera tras un snapshot sin fase):
// actualizar hoja en silencio, sin email.
const cambio = !esBaseline && hayDiffSemantico && !onlyFaseBootstrap;
const resumenDiff = esBaseline
  ? '(baseline: primera captura, sin alerta)'
  : onlyFaseBootstrap
    ? `(fase incorporada al snapshot sin alerta)\n${diffLines.join('\n')}`
    : hayDiffSemantico
      ? diffLines.join('\n')
      : faseCarriedForward
        ? `(sin diferencias; fase reutilizada del snapshot anterior; fetchOk=${faseFetchedOk})`
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
      hayDiffSemantico: cambio,
      onlyFaseBootstrap,
      faseCarriedForward,
      extractorVersion: '2026-09-08-semantic-v3',
      ahora: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
      row_number: fila.row_number,
    },
  },
];
