# Workflows de sistemas en n8n local (Windows)

Guía para montar los 5 patrones de automatización de sistemas que propones, **adaptados a Windows** (PowerShell / CMD) y a n8n self-hosted (`npx n8n`). Incluye seguridad del nodo **Execute Command** y el nodo **SSH**.

**Documentación completa** (fichas qué hace/qué no, RF/RNF, casos de uso, UML, Google Drive): [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md) — empieza por [Fichas por workflow](./documentacion-workflows-sistemas.md#2-fichas-por-workflow-lectura-rápida) si no conoces el proyecto.

**Arranque recomendado:** [`start-n8n.ps1`](./start-n8n.ps1).

**Workflows importables de partida:**

| Archivo | Caso | Estado |
|---------|------|--------|
| [`workflows/sistemas-uptime-health.json`](./workflows/sistemas-uptime-health.json) | Monitor HTTP + alerta Gmail | Probado (HTTP 200 en n8n local) |
| [`workflows/sistemas-vigilancia-carpeta.json`](./workflows/sistemas-vigilancia-carpeta.json) | Local File Trigger → mover a Procesados | Probado (PDF + email) |
| [`workflows/sistemas-backup-rotacion.json`](./workflows/sistemas-backup-rotacion.json) | ZIP full/diff/incr + skip + Drive + Gmail/Telegram | Hash + modos documentados |
| [`workflows/backup-carpeta.ps1`](./workflows/backup-carpeta.ps1) | Script PowerShell de ZIP | Auxiliar |
| [`workflows/rotar-backups.ps1`](./workflows/rotar-backups.ps1) | Script rotación `backup_*.zip` | Evita bug `$` en Execute Command |

Los casos 4 (deploy Docker) y 5 (auditoría logs) siguen documentados abajo para montarlos a mano.

**Fichas cortas (qué hace / qué no / backup / E-S):** [§2 de la documentación](./documentacion-workflows-sistemas.md#2-fichas-por-workflow-lectura-rápida).

---

## Requisitos comunes

- n8n en **local** (Local File Trigger y Execute Command no aplican igual en n8n Cloud).
- Credencial **Gmail** (o Telegram si lo prefieres).
- **n8n 2.x:** por seguridad, **Local File Trigger** y **Execute Command** vienen **excluidos**. Sin habilitarlos, al importar verás: *“This node is not currently installed…”*.
- **Read/Write Files:** allow-list por defecto `~\.n8n-files` → hace falta `N8N_RESTRICT_FILE_ACCESS_TO` para `n8n-backups`, etc.
- **Nunca** concatenes texto de un Webhook público en un comando sin sanitizar.

### Arranque persistente (recomendado)

Las variables ya están fijadas a nivel **Usuario** Windows. Arranca con el script (o `npx n8n` en una terminal **nueva**):

```powershell
powershell -File C:\Users\chuwi\Documents\n8n\start-n8n.ps1
```

Equivalente manual (misma sesión):

```powershell
$env:NODES_EXCLUDE = '[]'
$env:N8N_RESTRICT_FILE_ACCESS_TO = "$env:USERPROFILE\n8n-backups;$env:USERPROFILE\n8n-backup-origen;$env:USERPROFILE\.n8n-files"
npx n8n
```

Variables de Usuario (ya aplicadas una vez; reaplicar si cambias de PC):

```powershell
$restrict = "$env:USERPROFILE\n8n-backups;$env:USERPROFILE\n8n-backup-origen;$env:USERPROFILE\n8n-entradas;$env:USERPROFILE\n8n-procesados;$env:USERPROFILE\.n8n-files"
[System.Environment]::SetEnvironmentVariable('NODES_EXCLUDE', '[]', 'User')
[System.Environment]::SetEnvironmentVariable('N8N_RESTRICT_FILE_ACCESS_TO', $restrict, 'User')
[System.Environment]::SetEnvironmentVariable('N8N_COMMUNITY_PACKAGES_ENABLED', 'true', 'User')
[System.Environment]::SetEnvironmentVariable('GENERIC_TIMEZONE', 'Europe/Madrid', 'User')
```

Comprueba en el buscador de nodos que aparecen **Local File Trigger** y **Execute Command**. La zona horaria de Schedules es **Europe/Madrid** vía `GENERIC_TIMEZONE` (también en Settings de cada workflow).


---

## Seguridad: Execute Command y SSH

| Riesgo | Mitigación |
|--------|------------|
| Inyección de comandos | No uses `{{ $json.algo }}` crudo en la shell si viene de Internet |
| Borrados masivos | Prueba primero con `-WhatIf` / listar antes de `Remove-Item` |
| SSH a VPS | Clave dedicada, usuario mínimo, sin root si puedes |
| Firewall / ban IP | Empieza solo con **alerta**; el bloqueo automático es fácil de equivocar |

**Windows:** el nodo Execute Command suele lanzar `cmd.exe` o lo que configures; para PowerShell:

```text
powershell -NoProfile -Command "TU_COMANDO_AQUI"
```

**Linux/Mac:** Bash directo. **SSH:** nodo nativo `n8n-nodes-base.ssh` hacia otra máquina.

---

## 1. Monitor de servidores y servicios (Uptime)

### Objetivo

Cada pocos minutos comprobar URLs (y opcionalmente ping al router). Si fallan → **Gmail + Telegram**.

### Flujo

```text
Schedule (5 min)
  → Definir objetivo (URL, nombre, chatId)
  → HTTP Request (GET, neverError)
  → Evaluar ok / statusCode
  → IF caído
       → Gmail alerta
       → Telegram alerta   (en paralelo)
```

### Importar / actualizar

1. Importa (o reimporta) [`workflows/sistemas-uptime-health.json`](./workflows/sistemas-uptime-health.json).
2. Nodo **Definir objetivo**:
   - `url` / `nombre` → tu servicio
   - `chatId` → tu chat de Telegram (p. ej. `328226271`)
3. Credencial **Gmail** + destinatario en Gmail alerta.
4. Credencial **Telegram** en Telegram alerta (misma que el mensaje programado).
5. Para probar la alerta sin tumbar n8n: pon temporalmente una URL falsa (`http://127.0.0.1:1`) → Test → deberían llegar email y Telegram → vuelve a la URL real → Publish.

Detalle de bot / chat_id / timezone: [`configurar-telegram-mensajes.md`](./configurar-telegram-mensajes.md).

### Prueba realizada

Salida válida de «Evaluar respuesta»:

```json
{
  "nombre": "n8n local",
  "url": "http://localhost:5678",
  "statusCode": 200,
  "ok": true,
  "ahora": "4/9/2026, 12:58:51",
  "error": ""
}
```

Con `ok: true` no se envía email ni Telegram (correcto).

### Variantes Windows

**Ping al router** (Execute Command):

```powershell
powershell -NoProfile -Command "ping -n 4 192.168.1.1; if ($LASTEXITCODE -ne 0) { exit 1 }"
```

En el IF: si el comando falla (exit code ≠ 0) → alerta.

**Varias URLs:** hoja Google Sheets (como el monitor scraping) o un Code que devuelva un array de URLs + Split In Batches.

### Alerta sugerida

Asunto: `⚠️ Uptime — {{ $json.url }} no responde`  
Cuerpo: status, error, hora.

---

## 2. Copias de seguridad (full / diferencial / incremental + skip por hash)

### Objetivo

Cada noche (~03:00): **hashear** el contenido de la carpeta origen. Si no hay cambios → **no** ZIP ni Drive. Si hay cambios → generar ZIP (**full**, **diferencial** o **incremental**), subir a Drive, rotar retención y avisar por Gmail + Telegram.

### Tipos de copia

| Modo | Nombre ZIP | Contenido | Baseline |
|------|------------|-----------|----------|
| **full** | `backup_full_*.zip` | Todos los ficheros | Actualiza baseline de full y de “último backup” |
| **differential** | `backup_diff_*.zip` | Solo ficheros nuevos/cambiados **desde el último full** | Actualiza “último backup”; no cambia el full |
| **incremental** | `backup_incr_*.zip` | Solo ficheros nuevos/cambiados **desde el último backup** (cualquier modo) | Actualiza “último backup” |
| **auto** (default) | — | Si hash igual → **skip**. Si no → **ciclo semanal Madrid** (abajo). Si no hay full o el último full tiene ≥ `fullEveryDays` (7) → **full** | — |

#### Ciclo semanal (`mode=auto`, zona `Europe/Madrid`)

| Día | Tipo | Rol |
|-----|------|-----|
| **Domingo** | full | Base semanal (restauración total) |
| **Lunes–viernes** | incremental | Solo cambios desde el último backup |
| **Sábado** | differential | Cambios desde el último full; al crearla se eliminan los incr |

Skip por hash sigue aplicando: si no hay cambios en origen, no se genera ZIP ni se sube a Drive.

### Retención (local + Drive): máximo 1 por tipo

| Tras crear… | Se conserva | Se elimina |
|-------------|-------------|------------|
| **full** | 1 full (el nuevo) | fulls viejos + **todos** diff e incr |
| **differential** | 1 full + 1 diff | diffs viejos + **todos** incr |
| **incremental** | 1 full + 1 diff + 1 incr | incrs viejos |

Misma lógica en `n8n-backups` (`rotar-backups.ps1 -AfterMode …`) y en la carpeta de Google Drive (nodos Listar → Seleccionar → Borrar).

Estado en disco: `n8n-backups\.backup-state\` (`state.json`, `manifest-*.json` con SHA-256 por fichero).

### Flujo (JSON importable)

```text
Schedule (03:00)
  → Rutas backup (sourcePath, backupDir, mode=auto, fullEveryDays=7, chatId)
  → Ejecutar backup (backup-carpeta.ps1)  [error → Gmail/Telegram KO]
  → Parsear resultado
  → IF fallo → Gmail + Telegram KO
  → IF ZIP creado
       → sí: Leer ZIP → Drive upload
            → Listar ZIPs Drive → Seleccionar retención → (borrar antiguos si hace falta)
            → Rotación local → Gmail + Telegram OK
       → no: Gmail + Telegram “sin cambios”
```

### Telegram OK / KO / omitido

| Rama | Nodos | Cuándo |
|------|-------|--------|
| **OK** | `Telegram backup OK` (+ Gmail) | ZIP creado, Drive y rotación OK |
| **Omitido** | `Telegram sin cambios` (+ Gmail) | Hash igual → skip |
| **KO** | `Telegram backup KO` (+ Gmail) | Fallo del `.ps1`, parseo, lectura ZIP, Drive o rotación |

En **Rutas backup** pon `chatId` (p. ej. `328226271`). Misma credencial Telegram que el mensaje programado / uptime.

Textos típicos (**Parse Mode = HTML** en Additional Fields — n8n por defecto usa Markdown y el `_` de `backup_full_…` provoca el error `can't parse entities`):

```text
Backup OK (full|differential|incremental)
mensaje con cambios +/~/- o ORIGEN VACIADO
…

Backup omitido (sin cambios)
…

Backup KO
detalle del error
```

En Gmail OK verás dos bloques: **Retencion Drive** y **Retencion local** (ambos con política max 1 por tipo; no son borrados del origen).

### Importar / actualizar

1. Carpetas: `n8n-backup-origen`, `n8n-backups`.
2. Arranque con [`start-n8n.ps1`](./start-n8n.ps1).
3. Reimporta [`workflows/sistemas-backup-rotacion.json`](./workflows/sistemas-backup-rotacion.json).
4. En **Rutas backup**:
   - `mode`: `auto` | `full` | `differential` | `incremental`
   - `fullEveryDays`: `7`
   - `chatId`: tu Telegram
5. Credenciales Gmail, Drive, Telegram.
6. Test → Publish.

Scripts: [`backup-carpeta.ps1`](./workflows/backup-carpeta.ps1), [`rotar-backups.ps1`](./workflows/rotar-backups.ps1).

### Retención (`rotar-backups.ps1`)

Máximo **1 full + 1 diff + 1 incr** en disco. Parámetro `-AfterMode full|differential|incremental` aplica la cascada (full limpia diff/incr; diff limpia incr). Los ZIPs legado `backup_*.zip` sin sufijo se eliminan.

### Google Drive

Detalle: [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md#6-google-drive--configuración-completa).

Solo se ejecuta la rama Drive si `status=created`. Parent Drive `root`; Parent Folder = **ID actual** de tu carpeta en Drive (no reutilices un ID de una carpeta borrada).

### Skip por hash vs Drive vacío

| Situación | Comportamiento |
|-----------|----------------|
| Carpeta origen **sin cambios** (mismo hash) | `status=skipped` → **no** ZIP nuevo, **no** sube a Drive |
| Origen con ficheros nuevos/modificados | ZIP + Drive + aviso con `+N ~M -D` |
| Origen **vaciado** (borraste todo) | ZIP full vacío + aviso **ORIGEN VACIADO** (antes N → ahora 0). `Rotación deleted=…` es retención de ZIPs viejos, **no** borrados del origen |
| Borraste ficheros/carpeta **en Drive** pero el origen local no cambió | Sigue haciendo **skip**; Drive no se “rellena” solo |
| Quieres forzar ZIP + subida | Borra el estado local o usa `-Force` (abajo) |

Forzar regeneración:

```powershell
# Opción 1 — olvidar hash/baseline local
Remove-Item -Recurse -Force "$env:USERPROFILE\n8n-backups\.backup-state"

# Opción 2 — forzar en script
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\backup-carpeta.ps1 -Mode full -Force
```

Luego **Test workflow** en n8n (para que también pase por Drive).

### Error Drive 404 `File not found: <folderId>`

La carpeta de destino **ya no existe** (la borraste o el ID es viejo).

1. Crea una carpeta nueva en Drive (p. ej. `n8n-backups`).
2. Copia el ID de `https://drive.google.com/drive/folders/ID_NUEVO`.
3. En el nodo **Subir a Google Drive** → Parent Folder **By ID** → pega el ID nuevo.
4. Parent Drive sigue en **By ID** = `root`.

El ID antiguo del entorno de prueba (`18Nmjbym…`) **deja de valer** si esa carpeta se eliminó; hay que actualizar el nodo (y, si quieres, el JSON del repo).

### Google Drive (recordatorio de parámetros)

| Nodo | Parámetro | Valor |
|------|-----------|--------|
| Leer ZIP | File(s) Selector | `{{ $json.zipPathPosix }}` |
| Drive | Parent Drive | By ID = `root` |
| Drive | Parent Folder | By ID = **ID vigente** de tu carpeta |

```powershell
# Auto (skip / full semanal / diff diario)
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\backup-carpeta.ps1 -Mode auto

# Forzar modos
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\backup-carpeta.ps1 -Mode full
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\backup-carpeta.ps1 -Mode differential
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\backup-carpeta.ps1 -Mode incremental

# Rotación
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\rotar-backups.ps1 -BackupDir "$env:USERPROFILE\n8n-backups"
```

### Restauración (concepto)

- **Full solo:** descomprimir el `backup_full_*.zip`.
- **Full + diferencial:** descomprimir el full y encima el último `backup_diff_*.zip`.
- **Full + incrementales:** descomprimir el full y luego cada `backup_incr_*.zip` en orden cronológico hasta la fecha deseada.

### Base de datos

Si usas MySQL/Postgres, mejor un `.ps1` con `mysqldump` / `pg_dump` (secretos fuera del workflow).
---

## 3. Vigilancia de carpetas (Local File Trigger)

### Objetivo

Cuando cae un archivo en una carpeta → leerlo / procesarlo → moverlo a `Procesados`.

### Flujo

```text
Local File Trigger (carpeta, event: File Added)
  → Read Binary File (opcional)
  → (CSV → Spreadsheet File → DB)  o  (PDF/imagen → OCR/IA)
  → Move Binary / Execute Command (mover a Histórico)
```

### Importar

1. Crea carpetas, por ejemplo:
   - `C:\Users\chuwi\n8n-entradas`
   - `C:\Users\chuwi\n8n-procesados`
2. Importa `workflows/sistemas-vigilancia-carpeta.json` (con `NODES_EXCLUDE='[]'`).
3. Pon esas rutas en el trigger y en el comando de movimiento.
4. Publish y prueba soltando un archivo.

### Prueba realizada

Email recibido tras detectar `EST_REC_0030.pdf`:

- Origen: `C:\Users\chuwi\n8n-entradas\EST_REC_0030.pdf`
- Destino: `C:\Users\chuwi\n8n-procesados\EST_REC_0030.pdf`
- Salida comando: `OK EST_REC_0030.pdf`

### CSV → base de datos (ampliación)

Tras el trigger:

1. **Read Binary File** con la ruta del evento.
2. **Spreadsheet File** / **Extract From File** → filas JSON.
3. **Postgres / MySQL / Sheets** → insert.

### Imágenes

Nodo Vision / Ollama local → texto → guardar; luego mover archivo.

---

## 4. DevOps: deploy con Webhook + Docker / git

### Objetivo

Push a `main` → tu máquina ejecuta `git pull` + `docker compose up -d` → aviso.

### Flujo

```text
Webhook (POST /webhook/despliegue)
  → IF rama === main (filtrar payload GitHub)
  → Execute Command (script de deploy)
  → Gmail / Telegram éxito o fallo
```

### GitHub

1. Repo → Settings → Webhooks → URL de n8n (con túnel si no es pública: Cloudflare Tunnel, ngrok, etc.).
2. Evento: `push`.
3. En n8n, IF: `{{ $json.body.ref }}` equals `refs/heads/main`.

### Script de deploy (ejemplo prudente)

`C:\Scripts\deploy.ps1`:

```powershell
Set-Location C:\apps\mi-proyecto
git pull origin main
docker compose pull
docker compose up -d
```

n8n Execute Command:

```text
powershell -NoProfile -File C:\Scripts\deploy.ps1
```

### Avisos

- No ejecutes `docker`/`git` con parámetros sacados del webhook.
- Protege el webhook (header secreto / Basic Auth / IP allowlist).

---

## 5. Auditoría de seguridad y logs (Windows)

### Objetivo

Detectar muchos fallos de inicio de sesión y avisar (el bloqueo de firewall déjalo manual al principio).

### Flujo

```text
Schedule (1 h)
  → Execute Command (leer eventos de seguridad)
  → Code (contar por IP / usuario)
  → IF umbral
  → Gmail alerta crítica
```

### PowerShell — intentos fallidos recientes (Event ID 4625)

```powershell
powershell -NoProfile -Command "
$since = (Get-Date).AddHours(-1)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=$since} -ErrorAction SilentlyContinue |
  Select-Object -First 100 TimeCreated, Message |
  ConvertTo-Json -Compress
"
```

Requiere ejecutar n8n con permisos para leer el log **Security** (a menudo administrador), o auditar otro log de aplicación al que sí tengas acceso.

### Code (idea)

Parsear JSON, contar repeticiones de IP en el mensaje; si `count > 5` → `alerta: true`.

### Bloqueo firewall (solo si sabes lo que haces)

```powershell
New-NetFirewallRule -DisplayName "Block bad IP" -Direction Inbound -RemoteAddress 1.2.3.4 -Action Block
```

Empieza **solo alertando**; el ban automático puede cortarte a ti mismo.

---

## Nodo SSH (gestionar otra máquina)

Si n8n está en tu PC y el servicio en una VPS:

1. Credencial SSH (host, user, private key).
2. Nodo **SSH** → Execute Command / Upload / Download.
3. Mismos patrones (backup, deploy, health) pero remotos.

No hace falta agente n8n en el servidor destino.

---

## Orden recomendado para montarlos

1. **Uptime** — hecho / JSON listo.
2. **Carpeta local** — hecho / JSON listo.
3. **Backup** — JSON listo (`sistemas-backup-rotacion.json`).
4. **Deploy** — cuando tengas túnel HTTPS al webhook.
5. **Auditoría** — cuando controles permisos del Visor de eventos.

---

## Relación con lo que ya tienes

| Ya montado | Nuevo |
|------------|--------|
| Monitor JCyL / scraping (HTTP, Sheets, Gmail) | Misma alerta Gmail; otros triggers |
| ScraperAPI / Puppeteer | No necesarios aquí |
| Execute Command | Centro de backups, ping, deploy, logs |

---

## Resumen rápido

| # | Trigger | Acción clave | Alerta | JSON |
|---|---------|--------------|--------|------|
| 1 Uptime | Schedule 5 min | HTTP 200 / ping | Gmail + Telegram | `sistemas-uptime-health.json` |
| 2 Backup | Schedule 03:00 | hash + full/diff/incr + Drive | Gmail+Telegram | `sistemas-backup-rotacion.json` |
| 3 Carpeta | Local File Trigger | Mover a procesados | Gmail | `sistemas-vigilancia-carpeta.json` |
| 4 Deploy | Webhook GitHub | `git pull` + docker | Gmail/Telegram | (manual) |
| 5 Logs | Schedule 1 h | Eventos 4625 / auth.log | Gmail crítico | (manual) |
| Telegram programado | Schedule 09:00 | Send Message | Telegram | [`telegram-mensaje-programado.json`](./workflows/telegram-mensaje-programado.json) — guía [`configurar-telegram-mensajes.md`](./configurar-telegram-mensajes.md) |
