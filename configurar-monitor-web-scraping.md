# Monitor de scraping web en n8n (multi-URL, ScraperAPI)

Workflow para vigilar **varias páginas distintas** (precio, stock, un texto concreto…) y avisar por Gmail cuando se cumple una condición. La descarga del HTML va por **ScraperAPI**, no por un GET directo, para webs grandes o con antibot.

**Workflow importable:** [`workflows/monitor-web-scraping.json`](./workflows/monitor-web-scraping.json)

**Documentación completa** (usuario, desarrollador, funcionalidades, casos de uso, UML): [`documentacion-monitor-web-scraping.md`](./documentacion-monitor-web-scraping.md)

---

## Puppeteer: no está instalado

`n8n-nodes-base.puppeteer` **no existe** en n8n. Puppeteer es un **nodo de comunidad**:


| Dato           | Valor                                                   |
| -------------- | ------------------------------------------------------- |
| Paquete npm    | `n8n-nodes-puppeteer`                                   |
| Tipo de nodo   | `n8n-nodes-puppeteer.puppeteer` (no `n8n-nodes-base.*`) |
| En este equipo | No aparece en `~/.n8n` ni en el core de n8n             |


Por eso este workflow usa **ScraperAPI** (plan gratuito: [scraperapi.com](https://www.scraperapi.com/)). Si más adelante instalas el nodo comunitario, puedes sustituir el nodo `ScraperAPI (HTML)` por Puppeteer (`Get HTML` / `Get Page Content`) y dejar el resto igual.

Para instalar Puppeteer en tu n8n local: **Settings → Community Nodes → Install → `n8n-nodes-puppeteer`**. En Docker suele hacer falta Chromium y `--no-sandbox`; ScraperAPI evita esa fricción.

---

## Arquitectura

```text
Schedule (1 h)
  → Leer hoja (varias URLs)
  → Filtrar Activo=SI
  → Iterar URLs (1 a 1)
      → ScraperAPI GET (HTML como texto)
      → HTML (CSS selector de esa fila)
      → Evaluar alerta (contains / smaller_than / changed…)
      → IF alerta → Gmail
      → Actualizar Ultimo_Valor
```

Cada fila de la hoja es un sitio distinto: URL, selector CSS y regla de alerta propios.

---

## Paso 1 — ScraperAPI (API key)

**Por qué no ves «Variables»:** en n8n, **Variables** (`$vars`) es de plan **Pro / Business / Enterprise**. En Community (tu caso) no sale en Settings. **Environments** / **External Secrets** del menú tampoco sustituyen eso en Community.

### Opción recomendada — Credencial Query Auth

Igual que Gmail/Sheets: la key va cifrada en **Credentials**.

1. Cuenta en [scraperapi.com](https://www.scraperapi.com/) y copia la API key.
2. En n8n: **Credentials** → **Add credential** (o el `+` → Credential).
3. Busca **Query Auth** (tipo `httpQueryAuth`).
4. Rellena:
  - **Name** (nombre del parámetro): `api_key`
  - **Value**: pega tu API key de ScraperAPI
5. Guarda la credencial como `ScraperAPI`.
6. En el nodo **ScraperAPI (HTML)** del workflow:
  - Authentication: **Generic Credential Type**
  - Generic Auth Type: **Query Auth**
  - Credential: elige `ScraperAPI`

El nodo ya está preparado así en `workflows/monitor-web-scraping.json` (no lleva la key en claro).

### Alternativa — Variable de entorno (PowerShell)

Si prefieres no crear credencial, al arrancar n8n:

```powershell
$env:SCRAPERAPI_KEY = "pega_aqui_tu_api_key"
n8n start
```

Y en el nodo HTTP, añade un query param `api_key` = `={{ $env.SCRAPERAPI_KEY }}` (y quita la autenticación Query Auth). En muchas instalaciones Community `$env` está restringido; si falla, usa la credencial.

No crees un `.env` en el monorepo ni subas la key a GitHub.

`render=true` (columna **Render_JS = SI**) ejecuta JavaScript y gasta más créditos. Para HTML estático (books.toscrape.com) deja **NO**.

---

## Paso 2 — Hoja Google Sheets

Crea un Sheet: **Control Scraping Webs**.

### Fila 1 — encabezados


| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| `Nombre` | `URL` | `CSS_Selector` | `Condicion` | `Valor_Umbral` | `Render_JS` | `Activo` | `Ultimo_Valor` | `Ultima_Comprobacion` |



| Columna                 | Uso                                                                       |
| ----------------------- | ------------------------------------------------------------------------- |
| **Nombre**              | Título para el asunto del email                                           |
| **URL**                 | Página a vigilar (cualquier dominio)                                      |
| **CSS_Selector**        | Selector del dato (ej. `.price_color`)                                    |
| **Condicion**           | `contains` · `not_contains` · `smaller_than` · `greater_than` · `changed` |
| **Valor_Umbral**        | Texto a buscar o número (ej. `50`). Vacío si usas `changed`               |
| **Render_JS**           | `SI` = ScraperAPI con JS; `NO` = HTML estático                            |
| **Activo**              | `SI` / `NO`                                                               |
| **Ultimo_Valor**        | Lo rellena n8n (no lo edites a mano salvo para forzar baseline)           |
| **Ultima_Comprobacion** | Lo rellena n8n                                                            |


### Ejemplo (2 URLs distintas)


| Nombre                       | URL                                                                         | CSS_Selector   | Condicion      | Valor_Umbral | Render_JS | Activo |
| ---------------------------- | --------------------------------------------------------------------------- | -------------- | -------------- | ------------ | --------- | ------ |
| Libro — A Light in the Attic | `https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html` | `.price_color` | `smaller_than` | `50`         | `NO`      | `SI`   |
| Libro — Tipping the Velvet   | `https://books.toscrape.com/catalogue/tipping-the-velvet_999/index.html`    | `.price_color` | `changed`      |              | `NO`      | `SI`   |


El primer ejemplo avisa si el precio (hoy `£51.77`) **baja de 50**. El segundo avisa cuando el texto extraído **cambia** respecto a la última ejecución (`changed` no envía email en la primera pasada: guarda baseline).

Pon `Pendiente` en **Ultimo_Valor** si quieres forzar un baseline en `changed`.

---

## Paso 3 — Importar el workflow

1. n8n → **…** → **Import from File** → `workflows/monitor-web-scraping.json`.
2. En **Leer URLs a monitorizar** y **Actualizar fila**:
   - Pega la URL de tu Google Sheet.
   - Hoja: `Control Scraping Webs` (**By Name**, no By URL).
   - Misma credencial Google Sheets que el monitor JCyL.
3. En **Gmail alerta**:
   - Credencial **Gmail account**.
   - **To:** tu correo (el JSON trae `tu-correo@gmail.com`).
4. En el nodo **ScraperAPI (HTML)**, selecciona la credencial **Query Auth** `ScraperAPI`.

### Nodo «Actualizar fila» (importante)

No uses **Map Automatically**. Los campos del nodo anterior (`extraido`, `ahora`…) **no** se llaman igual que las columnas de la hoja (`Ultimo_Valor`, `Ultima_Comprobacion`).

Configura así:

| Campo | Valor |
|-------|--------|
| Credential | Tu Google Sheets |
| Resource | Sheet Within Document |
| Operation | **Update Row** |
| Document | **By URL** → pega la URL del spreadsheet |
| Sheet | **By Name** → nombre exacto de la **pestaña** (abajo a la izquierda en Sheets), no el título del archivo |
| Mapping Column Mode | **Map Each Column Manually** (no Automatic) |
| Column to Match On | `row_number` |

Valores a mapear (expresiones):

| Columna en Sheets | Expresión |
|-------------------|-----------|
| `row_number` | `{{ $('Evaluar alerta').item.json.row_number }}` |
| `Ultimo_Valor` | `{{ $('Evaluar alerta').item.json.extraido }}` |
| `Ultima_Comprobacion` | `{{ $('Evaluar alerta').item.json.ahora }}` |

**No dejes `row_number` en `0`.** Tiene que ser la expresión de arriba (viene de la lectura de la hoja).

#### Si ves columnas A, B, C… en lugar de Nombre, URL…

n8n no está leyendo la fila de encabezados. Dos caminos:

**A) Ideal — que salgan los nombres**

1. En Google Sheets, fila 1 exactamente:

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | Nombre | URL | CSS_Selector | Condicion | Valor_Umbral | Render_JS | Activo | Ultimo_Valor | Ultima_Comprobacion |

2. En el nodo: **Options** → si hay **Header Row**, pon `1`.
3. **Retry** / vuelve a abrir el nodo hasta que aparezcan esos nombres.
4. Mapea solo `Ultimo_Valor`, `Ultima_Comprobacion` y `row_number` (borra el resto con la papelera).

**B) Con letras A–I (sirve igual)**

Deja vacíos A–G (o bórralos con la papelera). Rellena solo:

| Campo | Modo | Valor |
|-------|------|--------|
| **H** | Expression | `{{ $('Evaluar alerta').item.json.extraido }}` |
| **I** | Expression | `{{ $('Evaluar alerta').item.json.ahora }}` |
| **row_number** | Expression | `{{ $('Evaluar alerta').item.json.row_number }}` |

(H = Ultimo_Valor, I = Ultima_Comprobacion, con el orden de columnas del Paso 2.)

Si el modo automático deja columnas vacías o no actualiza, es por ese desajuste de nombres.

#### Si sale «No columns found in Google Sheets»

1. **Pestaña ≠ título del archivo.** El campo **Sheet** es la pestaña inferior (ej. `Hoja 1`). Si renombraste el *archivo* a «Control Scraping Webs» pero la pestaña sigue siendo `Hoja 1`, escribe `Hoja 1` o renómbrala.
2. Mejor: en **Sheet** cambia a **From list** / lista y elige la pestaña (así no hay typo).
3. **Fila 1** debe tener encabezados (una celda por columna), por ejemplo:

   `Nombre | URL | CSS_Selector | Condicion | Valor_Umbral | Render_JS | Activo | Ultimo_Valor | Ultima_Comprobacion`

4. Comparte el Sheet con la misma cuenta Google de la credencial (o esa cuenta debe ser propietaria).
5. Prueba **Retry**. Si sigue fallando, abre el nodo **Leer URLs a monitorizar** con el mismo Document/Sheet: si ahí tampoco lista columnas, el problema es Document/pestaña/permisos, no el Update.

---

## Condiciones de alerta


| `Condicion`    | Cuándo envía email                                                        |
| -------------- | ------------------------------------------------------------------------- |
| `contains`     | El texto extraído incluye `Valor_Umbral` (sin distinguir mayúsculas)      |
| `not_contains` | Hay texto y **no** incluye el umbral (útil para “In stock”)               |
| `smaller_than` | Extrae el primer número (`£51.77` → `51.77`) y comprueba `< umbral`       |
| `greater_than` | Igual, con `>`                                                            |
| `changed`      | El valor es distinto al de **Ultimo_Valor** (ignora la primera ejecución) |


El nodo **HTML** usa el CSS de **esa fila**, así que cada URL puede tener un selector distinto.

---

## Probar

1. Ejecuta el workflow a mano (**Test workflow**).
2. Si ScraperAPI está bien, **Extraer con CSS** debe devolver algo como `£51.77` en `valor`.
3. Con umbral `50` y precio `51.77`, **alerta = false** (no hay email). Baja el umbral a `60` para forzar un email de prueba, luego restáuralo.
4. **Publish** cuando veas **Ultimo_Valor** y **Ultima_Comprobacion** actualizados.

Intervalo por defecto: **cada 1 hora**. Si tienes muchas filas o `Render_JS=SI`, sube a cada 6–12 h para no gastar el plan gratis.

---

## Solución de problemas


| Síntoma                                | Qué revisar                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| 401 / “Unauthorized” de ScraperAPI     | Credencial Query Auth mal creada (`Name` debe ser exactamente `api_key`) o API key incorrecta |
| No aparece Settings → Variables        | Normal en Community: usa credencial Query Auth (paso 1)                                       |
| «No hay URLs activas» en Filtrar activas | Sheets envía A/B/C o falta fila de datos. Pega el código de `workflows/filtrar-activas-scraping.js`. Fila 1 = encabezados; fila 2+ = URL, CSS_Selector, Activo=SI |
| «Protected domains… premium=true»      | MediaMarkt: añade query `premium=true` (y si hace falta `ultra_premium=true`). El plan free suele no bastar; gasta muchos créditos |
| HTML vacío o bloqueo                   | Pon `Render_JS=SI`; si sigue, `premium=true` |
| `valor` vacío                          | CSS incorrecto; prueba el selector en DevTools → Inspect                                      |
| Email en cada ejecución con `changed`  | Espacios distintos; mira **Ultimo_Valor** vs **valor**                                        |
| HTTP Request directo sí, ScraperAPI no | URL mal formada; el nodo ya pasa `url` como query param                                       |


Para una web **sin antibot**, puedes cambiar temporalmente la URL del nodo HTTP a `={{ $json.URL }}` y quitar query params de ScraperAPI. En cuanto bloquee, vuelve a ScraperAPI.

---

## Resumen rápido

1. Credencial **Query Auth** (`api_key` + tu key), no Variables (eso es plan de pago).
2. Hoja con una fila por URL (selector + condición).
3. Importar JSON, pegar Sheet, Gmail y credenciales.
4. Test → ajustar umbral → Publish.

