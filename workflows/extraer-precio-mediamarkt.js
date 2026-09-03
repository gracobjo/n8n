// Pegar en nodo Code DESPUÉS de "ScraperAPI (HTML)" (Run Once for All Items)
// Sustituye HTML + Evaluar alerta en fichas MediaMarkt.

const fila = $('Iterar URLs').item.json;
const html = String(
  $input.first().json.data ?? $input.first().json.body ?? '',
);

function pick(...keys) {
  for (const k of keys) {
    if (fila[k] !== undefined && fila[k] !== null && String(fila[k]).trim() !== '') {
      return fila[k];
    }
  }
  return '';
}

function parseNumero(text) {
  let s = String(text).replace(/\s/g, '').replace(/[–—€EUR]/gi, '');
  // Formato ES miles: 1.299,00 / 1.299
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return Number.NaN;
  return parseFloat(m[0]);
}

function collectJsonPrices(obj, out = []) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj === 'number' && obj >= 50 && obj <= 20000) {
    out.push(obj);
    return out;
  }
  if (typeof obj === 'string') {
    const n = parseNumero(obj);
    if (Number.isFinite(n) && n >= 50 && n <= 20000) out.push(n);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectJsonPrices(item, out);
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/price|amount|current|promo|offer/i.test(k)) collectJsonPrices(v, out);
      else if (typeof v === 'object') collectJsonPrices(v, out);
    }
  }
  return out;
}

function extractPrecioMediamarkt(source) {
  // 0) Bloqueo / página vacía
  if (!source || source.length < 500) return { precio: '', diag: 'HTML demasiado corto' };

  // 1) JSON-LD
  const ldBlocks = [
    ...source.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const block of ldBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const graph = node?.['@graph'];
        const list = graph ? (Array.isArray(graph) ? graph : [graph]) : [node];
        for (const n of list) {
          const offer = n?.offers ?? n?.Offer;
          const offers = Array.isArray(offer) ? offer : offer ? [offer] : [];
          for (const o of offers) {
            const p = o?.price ?? o?.lowPrice;
            if (p !== undefined && p !== null && String(p).trim() !== '') {
              return { precio: String(p), diag: 'json-ld' };
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2) __NEXT_DATA__ / estados embebidos
  const nextMatch = source.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (nextMatch) {
    try {
      const prices = collectJsonPrices(JSON.parse(nextMatch[1]));
      if (prices.length) {
        // Suele haber precio tachado + oferta; nos quedamos con el menor razonable (>100)
        const sorted = [...new Set(prices)].filter((p) => p >= 100).sort((a, b) => a - b);
        if (sorted.length) return { precio: String(sorted[0]), diag: 'next-data' };
      }
    } catch {
      /* ignore */
    }
  }

  // 3) Claves JSON sueltas en el HTML
  const keyPatterns = [
    /"price"\s*:\s*"?(?<p>\d+(?:[.,]\d+)?)"?/gi,
    /"currentPrice"\s*:\s*"?(?<p>\d+(?:[.,]\d+)?)"?/gi,
    /"sellingPrice"\s*:\s*"?(?<p>\d+(?:[.,]\d+)?)"?/gi,
    /"promoPrice"\s*:\s*"?(?<p>\d+(?:[.,]\d+)?)"?/gi,
    /"amount"\s*:\s*"?(?<p>\d+(?:[.,]\d+)?)"?/gi,
    /itemprop=["']price["'][^>]*content=["'](?<p>\d+(?:[.,]\d+)?)["']/gi,
  ];
  const found = [];
  for (const re of keyPatterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const n = parseNumero(m.groups.p);
      if (Number.isFinite(n) && n >= 100 && n <= 20000) found.push(n);
    }
  }
  if (found.length) {
    const sorted = [...new Set(found)].sort((a, b) => a - b);
    return { precio: String(sorted[0]), diag: 'json-keys' };
  }

  // 4) Texto visible tipo 1.299,– € / 1299,– €
  const plain = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const euroPrices = [
    ...plain.matchAll(
      /(\d{1,2}\.\d{3}|\d{3,5})(?:[.,]\d{2})?\s*[,\s]*[–-]?\s*€/g,
    ),
  ]
    .map((m) => parseNumero(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 100 && n <= 20000);
  if (euroPrices.length) {
    const sorted = [...new Set(euroPrices)].sort((a, b) => a - b);
    // Si hay tachado + oferta, el menor suele ser el actual (1299 vs 1899)
    return { precio: String(sorted[0]), diag: 'texto-€' };
  }

  return { precio: '', diag: 'sin-patrones' };
}

function diagnose(source) {
  const lower = source.toLowerCase();
  const flags = [];
  if (source.length < 2000) flags.push(`html_corto=${source.length}`);
  else flags.push(`html_len=${source.length}`);
  if (/captcha|cloudflare|access denied|challenge|bot|datadome|perimeter/i.test(lower)) {
    flags.push('posible_bloqueo');
  }
  if (!/mediamarkt/i.test(lower)) flags.push('sin_marca_mediamarkt');
  if (!/1598626|tuf|fx608/i.test(lower)) flags.push('sin_producto');
  if (!/€|eur|price/i.test(lower)) flags.push('sin_precio_ni_€');
  return flags.join(', ');
}

const { precio: extraido, diag } = extractPrecioMediamarkt(html);
if (!extraido) {
  throw new Error(
    `No se pudo extraer el precio de MediaMarkt (${diag}). Diagnóstico: ${diagnose(html)}. ` +
      'En la hoja pon Render_JS=SI, vuelve a ejecutar ScraperAPI y mira si el HTML es la ficha real o un muro antibot. ' +
      'En ScraperAPI free a veces hace falta el parámetro render=true; si sigue fallando, prueba country_code=es en el nodo HTTP.',
  );
}

const condicion = String(pick('Condicion', 'D') || 'changed').trim().toLowerCase();
const umbral = String(pick('Valor_Umbral', 'E') || '').trim();
const anterior = String(pick('Ultimo_Valor', 'H') || '').trim();
const esBaseline = anterior === '' || anterior.toLowerCase() === 'pendiente';

let alerta = false;
let motivo = '';

if (condicion === 'contains') {
  alerta = extraido.toLowerCase().includes(umbral.toLowerCase());
  motivo = `Contiene «${umbral}»`;
} else if (condicion === 'not_contains') {
  alerta = extraido !== '' && !extraido.toLowerCase().includes(umbral.toLowerCase());
  motivo = `No contiene «${umbral}»`;
} else if (condicion === 'smaller_than') {
  const n = parseNumero(extraido);
  const u = parseNumero(umbral);
  alerta = Number.isFinite(n) && Number.isFinite(u) && n < u;
  motivo = alerta ? `Precio ${n} < umbral ${u}` : `Precio ${n} no es < umbral ${u}`;
} else if (condicion === 'greater_than') {
  const n = parseNumero(extraido);
  const u = parseNumero(umbral);
  alerta = Number.isFinite(n) && Number.isFinite(u) && n > u;
  motivo = alerta ? `Precio ${n} > umbral ${u}` : `Precio ${n} no es > umbral ${u}`;
} else {
  alerta = !esBaseline && String(parseNumero(extraido)) !== String(parseNumero(anterior)) && extraido !== anterior;
  motivo = 'El precio ha cambiado respecto a la última comprobación';
}

return [
  {
    json: {
      nombre: String(pick('Nombre', 'A') || 'Página').trim(),
      url: String(pick('URL', 'B') || '').trim(),
      selector: `mediamarkt:${diag}`,
      extraido,
      anterior,
      alerta,
      motivo,
      condicion,
      umbral,
      ahora: new Date().toLocaleString('es-ES'),
      row_number: fila.row_number,
    },
  },
];
