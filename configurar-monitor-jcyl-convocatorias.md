# Monitor de convocatorias JCyL en n8n (multi-convocatoria)

Guía única para monitorizar **varias convocatorias** de empleo público de la Junta de Castilla y León, detectar cambios en fechas/plazos y recibir alertas por Gmail. Incluye descubrimiento automático de convocatorias nuevas (equivalente regional al buscador de [administracion.gob.es](https://administracion.gob.es/pagFront/empleoBecas/empleo/buscadorEmpleoAvanzado.htm), pero centrado en JCyL).

**Workflows importables:**

| Archivo | Función |
|---------|---------|
| [`workflows/monitor-jcyl-convocatorias.json`](./workflows/monitor-jcyl-convocatorias.json) | Monitoriza todas las filas activas de tu hoja |
| [`workflows/monitor-jcyl-descubrir-nuevas.json`](./workflows/monitor-jcyl-descubrir-nuevas.json) | Avisa cuando aparece una convocatoria nueva en «Empleo público al día» |

---

## Tabla de contenidos

1. [Enfoque: por qué JCyL y no solo administracion.gob.es](#enfoque-por-qué-jcyl-y-no-solo-administraciongobes)
2. [Arquitectura (2 workflows)](#arquitectura-2-workflows)
3. [Requisitos previos](#requisitos-previos)
4. [Paso 1 — Hoja de control (multi-convocatoria)](#paso-1--hoja-de-control-multi-convocatoria)
5. [Paso 2 — Cómo añadir convocatorias](#paso-2--cómo-añadir-convocatorias)
6. [Paso 3 — Workflow de monitorización](#paso-3--workflow-de-monitorización)
7. [Paso 4 — Workflow de descubrimiento (opcional)](#paso-4--workflow-de-descubrimiento-opcional)
8. [Paso 5 — Probar y publicar](#paso-5--probar-y-publicar)
9. [Solución de problemas](#solución-de-problemas)
10. [Resumen rápido](#resumen-rápido)

---

## Enfoque: por qué JCyL y no solo administracion.gob.es

| Portal | Qué ofrece | Limitación |
|--------|------------|------------|
| [administracion.gob.es](https://administracion.gob.es/pagFront/ofertasempleopublico/detalleEmpleo.htm?idConvocatoria=221710) | Buscador nacional con filtros (ámbito autonómico, Castilla y León, plazos, titulación…) | Resume plazos y disposiciones; el detalle vivo de procesos JCyL está en su portal propio |
| [empleopublico.jcyl.es](https://empleopublico.jcyl.es/web/es/empleo-publico/empleo-publico.html) | **Fuente oficial JCyL**: fechas de publicación, plazos, tribunal, admitidos/excluidos | No tiene API; hay que scrapear HTML |

**Solución adoptada:**

1. **Monitorización** → URL de detalle en `empleopublico.jcyl.es` (una fila por convocatoria en Google Sheets).
2. **Descubrimiento** → escaneo diario de [Empleo público al día](https://empleopublico.jcyl.es/web/es/empleo-publico/empleo-publico.html) (listado actualizado de procesos JCyL).
3. **Búsqueda manual ampliada** → [Buscador de convocatorias JCyL](http://empleopublico.jcyl.es/web/jcyl/EmpleoPublico/es/PlantillaBuscadorContenidos/1277227614255/Convocatoria/1277227637904/_) (incluye fuera de plazo) o [buscador avanzado 060](https://administracion.gob.es/pagFront/empleoBecas/empleo/buscadorEmpleoAvanzado.htm) con **Ámbito autonómico** + **Castilla y León** + **Administración convocante: Comunidad autónoma**.

> Para promoción interna y procesos recientes, el portal JCyL suele ser más completo que el agregador nacional.

---

## Arquitectura (2 workflows)

### Workflow A — Monitor (cada 12 h)

```text
Schedule → Sheets (todas las filas) → Filtrar Activo=SI
  → Loop (1 convocatoria) → HTTP (URL de la fila) → Code (extraer + comparar)
  → IF cambio → Gmail → Update fila → siguiente convocatoria
```

### Workflow B — Descubrir nuevas (cada 24 h, opcional)

```text
Schedule → HTTP (Empleo público al día) → Code (extraer enlaces JCyL)
  → Sheets (URLs conocidas) → Code (diff) → IF hay nuevas → Gmail
```

Tú decides qué convocatorias monitorizar: el workflow B **avisa**; tú añades la fila en Sheets con `Activo=SI`.

---

## Requisitos previos

- n8n en local: `http://localhost:5678`
- Credencial **Gmail OAuth2 API** → `Gmail account`
- Credencial **Google OAuth2 API** (scope `https://www.googleapis.com/auth/spreadsheets`) → `Google account`

Configuración OAuth: [`configurar-gmail-sheets.md`](./configurar-gmail-sheets.md)

---

## Paso 1 — Hoja de control (multi-convocatoria)

Crea un Google Sheet: **Control Convocatorias JCyL**.

### Fila 1 — encabezados

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| `Nombre` | `URL` | `URLs_Adicionales` | `Activo` | `Palabras_clave` | `Ultima_Fecha_Extraida` | `Ultima_Comprobacion` |

| Columna | Uso |
|---------|-----|
| **Nombre** | Título legible (para el asunto del email) |
| **URL** | Página **principal** de la convocatoria |
| **URLs_Adicionales** | Páginas de **fase** (resoluciones, aprobados, 2º ejercicio…). Separa con `;` si hay varias |
| **Activo** | `SI` = monitorizar, `NO` = ignorar |
| **Palabras_clave** | Filtro de descubrimiento: separa con `,` o `;` (ej. `informática, gestión`). Si hay valores en la hoja, solo avisa de convocatorias nuevas cuyo título las contenga |
| **Ultima_Fecha_Extraida** | Estado completo guardado (no solo una fecha) |
| **Ultima_Comprobacion** | Última vez que n8n revisó la fila |

### Filas de ejemplo

| Nombre | URL | Activo | Palabras_clave | Ultima_Fecha_Extraida | Ultima_Comprobacion |
|--------|-----|--------|----------------|----------------------|---------------------|
| Técnico-a Soporte Informático | `https://empleopublico.jcyl.es/.../1285519792195/Empleo` | `https://empleopublico.jcyl.es/.../1285670309856/Empleo?plantillaObligatoria=...` | SI | informática | Pendiente | Pendiente |
| Técnico-a Gestión Informática (PI) | `https://empleopublico.jcyl.es/.../Empleo` | *(vacío)* | SI | informática | Pendiente | Pendiente |
| Educador-a Centros (2022) | *(pega URL principal)* | *(vacío)* | SI | educación | Pendiente | Pendiente |
| Cuerpo Gestión Económico-Financiera | *(pega URL)* | *(vacío)* | NO | economía | — | — |
| **_Descubrimiento** | *(vacío)* | *(vacío)* | NO | informática; sanidad; gestión | — | — |

### Páginas de fase JCyL (importante)

JCyL publica la convocatoria en **dos niveles**:

| Tipo | Ejemplo | Qué contiene |
|------|---------|--------------|
| **Principal** | [Técnico Soporte Informático](https://empleopublico.jcyl.es/web/jcyl/EmpleoPublico/es/Plantilla100Detalle/1277227614255/Convocatoria/1285519792195/Empleo) | Resumen por secciones (BOCYL, plazos, tribunal, aprobados…) |
| **Fase** | [Aprobados 1º ejercicio / convocatoria 2º](https://empleopublico.jcyl.es/web/jcyl/EmpleoPublico/es/Plantilla100Detalle/1277227614255/Convocatoria/1285670309856/Empleo?plantillaObligatoria=17PlantillaContenidoFaseConvocatoria) | Resolución completa, **fecha del 2º ejercicio** (ej. 19 sept 2026), plazos de revisión |

La URL principal **resume** la novedad, pero el detalle (fecha/hora del segundo ejercicio) suele estar solo en la **página de fase**. Pon esa URL en **URLs_Adicionales**.

```text
URL            → https://.../1285519792195/Empleo
URLs_Adicionales → https://.../1285670309856/Empleo?plantillaObligatoria=17PlantillaContenidoFaseConvocatoria
```

El monitor concatena ambas en columna **F** (`[principal] … || [fase] …`).

> **`Pendiente` en columna E:** primera ejecución guarda baseline **sin email**. Pon `NO` en **Activo** para pausar una convocatoria sin borrar la fila.

### Filtro por palabras clave (Workflow B)

El workflow de descubrimiento **solo envía email** si el título de la convocatoria nueva contiene alguna palabra clave. Hay dos modos:

| Modo | Cómo activarlo |
|------|----------------|
| **Filtro dedicado** (recomendado) | Fila con **Nombre** = `_Descubrimiento`, **URL** vacía, **Palabras_clave** = `informática; sanidad; gestión` |
| **Agregado automático** | Sin fila `_Descubrimiento`: une todas las **Palabras_clave** de las demás filas |
| **Sin filtro** | Ninguna fila tiene **Palabras_clave** → avisa de **todas** las convocatorias nuevas |

- Separadores válidos: coma `,`, punto y coma `;` o salto de línea.
- La búsqueda **ignora mayúsculas y tildes** (`informatica` coincide con `informática`).
- Mínimo 2 caracteres por palabra clave.

---

## Paso 2 — Cómo añadir convocatorias

### Opción A — Desde «Empleo público al día» (recomendado)

1. Abre [Empleo público al día](https://empleopublico.jcyl.es/web/es/empleo-publico/empleo-publico.html).
2. Haz clic en la convocatoria que te interese.
3. Copia la URL del navegador (debe contener `Plantilla100Detalle` y `/Empleo`).
4. Añade una fila en Sheets: **Nombre**, **URL**, **Activo=SI**, **Ultima_Fecha_Extraida=Pendiente**.

### Opción B — Buscador JCyL (incluye fuera de plazo)

1. Abre el [Buscador de convocatorias JCyL](http://empleopublico.jcyl.es/web/jcyl/EmpleoPublico/es/PlantillaBuscadorContenidos/1277227614255/Convocatoria/1277227637904/_).
2. Escribe palabras clave (ej. `informática`, `gestión`).
3. Marca **Incluir fuera de plazo** si buscas procesos antiguos aún con movimientos.
4. Entra en el resultado → copia URL → nueva fila en Sheets.

### Opción C — Buscador nacional (referencia cruzada)

1. [Buscador avanzado administracion.gob.es](https://administracion.gob.es/pagFront/empleoBecas/empleo/buscadorEmpleoAvanzado.htm)
2. **Ámbito geográfico:** Autonómico
3. **Comunidad autónoma:** Castilla y León
4. **Administración convocante:** Comunidad autónoma
5. Localiza la convocatoria → en **Más información** suele haber enlace al organismo.
6. Para monitorizar cambios de fechas JCyL, usa siempre la URL de `empleopublico.jcyl.es`, no la de administracion.gob.es.

### Opción D — Descubrimiento automático (Workflow B)

Importa [`monitor-jcyl-descubrir-nuevas.json`](./workflows/monitor-jcyl-descubrir-nuevas.json). Te llegará un email cuando aparezca un enlace nuevo en «Empleo público al día» que **no esté en tu hoja** y cuyo título coincida con tus **Palabras_clave**. Revisa y añade la fila manualmente con `Activo=SI`.

---

## Paso 3 — Workflow de monitorización

Importa [`workflows/monitor-jcyl-convocatorias.json`](./workflows/monitor-jcyl-convocatorias.json) o crea los nodos:

### Nodo 1 — Schedule Trigger

- Cada **12 horas** (o 1 día).

### Nodo 2 — Leer todas las convocatorias (Google Sheets)

- Operation: **Get Row(s)**
- Document: URL de tu hoja
- Sheet: `Control Convocatorias JCyL`
- **Sin filtro** (lee todas las filas)

### Nodo 3 — Filtrar activas (Code)

```javascript
const rows = $input.all().map((item) => item.json);

const activas = rows.filter((row) => {
  if (!row.URL || String(row.URL).trim() === '') return false;
  const activo = String(row.Activo ?? 'SI').trim().toUpperCase();
  return activo === 'SI' || activo === 'SÍ' || activo === 'TRUE' || activo === '1';
});

if (activas.length === 0) {
  throw new Error('No hay convocatorias activas en la hoja. Añade filas con Activo=SI y una URL.');
}

return activas.map((row) => ({ json: row }));
```

### Nodo 4 — Iterar convocatorias (Split In Batches)

- **Batch Size:** `1`

### Nodo 5 — HTTP Request

| Campo | Valor |
|-------|-------|
| URL | `={{ $json.URL }}` |
| Response Format | **Text** |

Header opcional: `User-Agent` de navegador.

### Nodo 6 — Extraer y comparar (Code)

```javascript
const fila = $('Iterar convocatorias').item.json;
const url = String(fila.URL ?? '').trim();
const nombre = String(fila.Nombre ?? 'Convocatoria JCyL').trim();

const html =
  $input.first().json.data ??
  $input.first().json.body ??
  '';

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const campos = [];
const regexHtml = /<strong>([^<:]+):<\/strong>\s*([^<]*)/gi;
let match;

while ((match = regexHtml.exec(html)) !== null) {
  const etiqueta = stripHtml(match[1]);
  const valor = stripHtml(match[2]);
  if (!etiqueta || !valor) continue;
  if (/fecha|plazo|límite|publicación|información adicional/i.test(etiqueta)) {
    campos.push(`${etiqueta}: ${valor}`);
  }
}

if (campos.length === 0) {
  const regexMarkdown = /\*\*([^*]+):\*\*\s*([^\n*]+)/g;
  while ((match = regexMarkdown.exec(html)) !== null) {
    const etiqueta = match[1].trim();
    const valor = match[2].trim();
    if (/fecha|plazo|límite|publicación|información adicional/i.test(etiqueta)) {
      campos.push(`${etiqueta}: ${valor}`);
    }
  }
}

const estadoActual =
  campos.length > 0 ? campos.join(' | ') : 'No se encontraron fechas';

const estadoAnterior =
  fila.Ultima_Fecha_Extraida ??
  fila['Ultima_Fecha_Extraida'] ??
  'Pendiente';

const esBaseline =
  estadoAnterior === 'Pendiente' || String(estadoAnterior).trim() === '';
const cambio = !esBaseline && estadoAnterior !== estadoActual;

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
```

> El nodo **Iterar convocatorias** debe llamarse exactamente así (el Code lo referencia).

### Nodo 7 — IF cambio

- `{{ $json.cambio }}` → **is true**
- **true** → Gmail
- **false** → Actualizar fila

### Nodo 8 — Gmail alerta (rama true)

| Campo | Valor |
|-------|-------|
| Subject | `[JCyL] Cambio — {{ $json.titulo }}` |

**Message:**

```text
Se detectó un cambio en una convocatoria de empleo público de JCyL.

Convocatoria: {{ $json.titulo }}
URL: {{ $json.url }}
Comprobado: {{ $json.ahora }}

--- ESTADO ANTERIOR ---
{{ $json.estadoAnterior }}

--- ESTADO ACTUAL ---
{{ $json.estadoActual }}
```

### Nodo 9 — Actualizar fila (Google Sheets)

Conecta **Gmail → aquí** y **IF false → aquí**. Luego **Actualizar fila → Iterar convocatorias** (cierra el bucle).

| Columna | Expresión |
|---------|-----------|
| `Ultima_Fecha_Extraida` | `{{ $('Extraer y comparar').item.json.estadoActual }}` |
| `Ultima_Comprobacion` | `{{ $('Extraer y comparar').item.json.ahora }}` |
| Match on | `row_number` |

---

## Paso 4 — Workflow de descubrimiento (opcional)

Importa [`workflows/monitor-jcyl-descubrir-nuevas.json`](./workflows/monitor-jcyl-descubrir-nuevas.json).

- **Frecuencia:** 1 vez al día (08:00).
- **Fuente:** [Empleo público al día](https://empleopublico.jcyl.es/web/es/empleo-publico/empleo-publico.html).
- **Filtro:** palabras clave de la hoja (fila `_Descubrimiento` o agregado de columnas **Palabras_clave**).
- **Acción:** email si hay URL JCyL nueva **y** el título coincide con alguna palabra clave.
- **No añade filas solo:** tú revisas y pones `Activo=SI` si te interesa.

### Nodo clave — Detectar nuevas (Code)

Lógica del filtro (ya incluida en el JSON importable):

```javascript
function parseKeywords(text) {
  if (!text || String(text).trim() === '') return [];
  return String(text)
    .split(/[,;|\n]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 2);
}

function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesKeyword(titulo, keywords) {
  const hay = normalize(titulo);
  for (const kw of keywords) {
    if (hay.includes(normalize(kw))) return kw;
  }
  return null;
}

const enlaces = $('Extraer enlaces JCyL').all().map((i) => i.json);
const filas = $input.all().map((i) => i.json);

const urlsConocidas = new Set(
  filas.map((f) => String(f.URL ?? '').trim()).filter(Boolean),
);

// Prioridad: fila _Descubrimiento (URL vacía)
const filaFiltro = filas.find(
  (f) =>
    String(f.Nombre ?? '').trim().toLowerCase() === '_descubrimiento' &&
    !String(f.URL ?? '').trim(),
);

let keywords = [];
if (filaFiltro?.Palabras_clave) {
  keywords = parseKeywords(filaFiltro.Palabras_clave);
} else {
  const set = new Set();
  for (const f of filas) {
    for (const k of parseKeywords(f.Palabras_clave)) set.add(k);
  }
  keywords = [...set];
}

const filtrarPorKeywords = keywords.length > 0;
const nuevas = [];

for (const item of enlaces) {
  if (urlsConocidas.has(item.url)) continue;
  if (filtrarPorKeywords) {
    const match = matchesKeyword(item.titulo, keywords);
    if (!match) continue;
    nuevas.push({ ...item, palabraCoincidente: match });
  } else {
    nuevas.push({ ...item, palabraCoincidente: null });
  }
}
// ... devuelve hayNuevas: true/false por item
```

El email incluye **Palabra clave coincidente** y **Filtros activos**.

Para ampliar el descubrimiento a más páginas (p. ej. paginación 1–3 de «Empleo público al día»), duplica el nodo HTTP con parámetros de página o añade un segundo HTTP al buscador JCyL.

---

## Paso 5 — Probar y publicar

### Monitor (Workflow A)

1. Deja **2 filas** con `Activo=SI` y `Ultima_Fecha_Extraida=Pendiente`.
2. **Execute workflow** → ambas filas se actualizan, **sin emails**.
3. Cambia **B2** (columna E de una fila) a `Prueba` → ejecuta → **1 email** por fila cambiada.
4. **Publish**.

### Descubrimiento (Workflow B)

1. Añade la fila `_Descubrimiento` con `Palabras_clave = informática` (o la palabra que sepas que aparece hoy en el listado).
2. Asegúrate de que **ninguna URL** del listado actual esté ya en tu hoja (o borra una fila de prueba).
3. **Execute workflow** → solo recibes email si el título contiene la palabra clave.
4. Prueba negativa: cambia `Palabras_clave` a `xyzxyz123` → no debe llegar email.
5. **Publish**.

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `No hay convocatorias activas` | Añade filas con **URL** y **Activo=SI** |
| `No se encontraron fechas` | URL incorrecta o HTML distinto; comprueba que la URL contiene `/Empleo` al final |
| Email solo de una convocatoria | Normal si solo una cambió; el loop procesa todas |
| Loop infinito / no avanza | **Actualizar fila** debe conectar de vuelta a **Iterar convocatorias** |
| Descubrimiento no avisa | Ya está en la hoja, no está en la 1.ª página del listado, o el **título no contiene** ninguna palabra clave configurada |
| Demasiados emails de descubrimiento | Usa fila `_Descubrimiento` con palabras más específicas, o reduce keywords agregadas |
| Quiero pausar una convocatoria | `Activo=NO` (no borres la fila) |

---

## Resumen rápido

1. **Hoja multi-fila:** Nombre, URL, Activo, Ultima_Fecha_Extraida (`Pendiente` al inicio).
2. **Workflow A:** monitor en bucle → importar `monitor-jcyl-convocatorias.json`.
3. **Workflow B (opcional):** detectar nuevas filtradas por **Palabras_clave** → `monitor-jcyl-descubrir-nuevas.json`.
4. **Fuentes JCyL:** [Empleo público al día](https://empleopublico.jcyl.es/web/es/empleo-publico/empleo-publico.html), [Buscador JCyL](http://empleopublico.jcyl.es/web/jcyl/EmpleoPublico/es/PlantillaBuscadorContenidos/1277227614255/Convocatoria/1277227637904/_).
5. **Referencia nacional:** [administracion.gob.es](https://administracion.gob.es/pagFront/empleoBecas/empleo/buscadorEmpleoAvanzado.htm) filtrado a Castilla y León → localizar → monitorizar URL JCyL.
6. **Publicar** ambos workflows tras probar.
