// Pegar en nodo "Evaluar alerta" (Run Once for All Items)
// Compatible con precios ES: 1.199,00€ → 1199

const fila = $('Iterar URLs').item.json;
const extraidoRaw = $input.first().json.valor;
const extraido = Array.isArray(extraidoRaw)
  ? extraidoRaw.join(' | ')
  : String(extraidoRaw ?? '').trim();

const condicion = String(fila.Condicion ?? 'changed').trim().toLowerCase();
const umbral = String(fila.Valor_Umbral ?? '').trim();
const anterior = String(fila.Ultimo_Valor ?? '').trim();
const esBaseline =
  anterior === '' || anterior.toLowerCase() === 'pendiente';

/** Interpreta 1.199,00€ / 1199,00 € / £51.77 */
function parseNumero(text) {
  let s = String(text).replace(/\s/g, '').replace(/[€$£]|EUR/gi, '');
  // Miles ES: 1.199,00 o 1.199
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    // £51.77 u otros: deja el primer número “simple”
    const m = s.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return Number.NaN;
    s = m[0].replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

let alerta = false;
let motivo = '';

if (condicion === 'contains') {
  alerta = extraido.toLowerCase().includes(umbral.toLowerCase());
  motivo = `El texto extraído contiene «${umbral}»`;
} else if (condicion === 'not_contains') {
  alerta =
    extraido !== '' &&
    !extraido.toLowerCase().includes(umbral.toLowerCase());
  motivo = `El texto extraído no contiene «${umbral}»`;
} else if (condicion === 'smaller_than') {
  const n = parseNumero(extraido);
  const u = parseNumero(umbral);
  alerta = Number.isFinite(n) && Number.isFinite(u) && n < u;
  motivo = alerta
    ? `Precio ${n} < umbral ${u}`
    : `Precio ${n} no es < umbral ${u}`;
} else if (condicion === 'greater_than') {
  const n = parseNumero(extraido);
  const u = parseNumero(umbral);
  alerta = Number.isFinite(n) && Number.isFinite(u) && n > u;
  motivo = alerta
    ? `Precio ${n} > umbral ${u}`
    : `Precio ${n} no es > umbral ${u}`;
} else {
  const n = parseNumero(extraido);
  const a = parseNumero(anterior);
  if (Number.isFinite(n) && Number.isFinite(a)) {
    alerta = !esBaseline && n !== a;
  } else {
    alerta = !esBaseline && extraido !== anterior;
  }
  motivo = 'El valor extraído ha cambiado respecto a la última comprobación';
}

return [
  {
    json: {
      nombre: String(fila.Nombre ?? 'Página').trim(),
      url: String(fila.URL ?? '').trim(),
      selector: String(fila.CSS_Selector ?? '').trim(),
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
