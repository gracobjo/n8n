// Pegar en nodo "Extraer y comparar" (Run Once for All Items)
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

function extractEstadoFromHtml(sourceHtml, origen = 'principal') {
  const campos = [];
  const seen = new Set();

  const add = (etiqueta, valor, maxLen = 220) => {
    const e = stripHtml(etiqueta).replace(/:+$/, '').trim();
    let v = stripHtml(valor).replace(/^:+\s*/, '').trim();
    if (!e || !v) return;
    if (v.length > maxLen) v = `${v.slice(0, maxLen)}…`;
    const key = `${e}: ${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    campos.push(key);
  };

  // Página principal: agrupar por sección <h2>
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

  // Fallback principal sin h2
  if (origen === 'principal' && campos.length === 0) {
    const regexHtml = /<strong>([^<:]+):<\/strong>\s*([^<]*)/gi;
    let match;
    while ((match = regexHtml.exec(sourceHtml)) !== null) {
      if (/fecha|plazo|límite|publicación|información adicional/i.test(match[1])) {
        add(match[1], match[2]);
      }
    }
  }

  // Página de fase: solo bloques útiles (sin resolución completa)
  if (origen === 'fase') {
    const regexH2 = /<h2[^>]*>([^<]+)<\/h2>\s*([\s\S]*?)(?=<h2|<\/main|$)/gi;
    let match;
    while ((match = regexH2.exec(sourceHtml)) !== null) {
      const titulo = stripHtml(match[1]);
      const cuerpo = match[2].replace(/<script[\s\S]*?<\/script>/gi, '');

      if (/convocatoria a la que pertenece/i.test(titulo)) continue;

      if (/contenido publicado el/i.test(titulo)) {
        add(
          'Contenido publicado el',
          titulo.replace(/contenido publicado el\s*/i, ''),
        );
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

    const pubMatch = textoPlano.match(/Contenido publicado el\s+(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4})/i);
    if (pubMatch) add('Contenido publicado el', pubMatch[1], 40);
  }

  if (campos.length === 0) return `[${origen}] No se encontraron fechas`;
  return `[${origen}] ${campos.join(' | ')}`;
}

const partes = [extractEstadoFromHtml(html, 'principal')];

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
    partes.push(extractEstadoFromHtml(body, 'fase'));
  } catch {
    partes.push('[fase] Error al leer URL adicional');
  }
}

const estadoActual = partes.join(' || ');

const estadoAnterior =
  fila.Ultima_Fecha_Extraida ??
  fila['Ultima_Fecha_Extraida'] ??
  'Pendiente';

function normalizeEstadoForCompare(text) {
  return String(text)
    .replace(/\[principal\]\s*/gi, '')
    .replace(/\[fase\]\s*/gi, '')
    .replace(/\s*\|\|\s*/g, ' | ')
    .replace(/::+/g, ':')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const esBaseline =
  estadoAnterior === 'Pendiente' || String(estadoAnterior).trim() === '';
const cambio =
  !esBaseline &&
  normalizeEstadoForCompare(estadoAnterior) !==
    normalizeEstadoForCompare(estadoActual);

return [
  {
    json: {
      url,
      titulo: nombre,
      estadoActual,
      estadoAnterior,
      cambio,
      esBaseline,
      ahora: new Date().toLocaleString('es-ES'),
      row_number: fila.row_number,
    },
  },
];
