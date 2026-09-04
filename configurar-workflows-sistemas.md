# Workflows de sistemas en n8n local (Windows)

Guía para montar los 5 patrones de automatización de sistemas que propones, **adaptados a Windows** (PowerShell / CMD) y a n8n self-hosted (`npx n8n`). Incluye seguridad del nodo **Execute Command** y el nodo **SSH**.

**Documentación completa** (fichas qué hace/qué no, RF/RNF, casos de uso, UML, Google Drive): [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md) — empieza por [Fichas por workflow](./documentacion-workflows-sistemas.md#2-fichas-por-workflow-lectura-rápida) si no conoces el proyecto.

**Arranque recomendado:** [`start-n8n.ps1`](./start-n8n.ps1).

**Workflows importables de partida:**

| Archivo | Caso | Estado |
|---------|------|--------|
| [`workflows/sistemas-uptime-health.json`](./workflows/sistemas-uptime-health.json) | Monitor HTTP + alerta Gmail | Probado (HTTP 200 en n8n local) |
| [`workflows/sistemas-vigilancia-carpeta.json`](./workflows/sistemas-vigilancia-carpeta.json) | Local File Trigger → mover a Procesados | Probado (PDF + email) |
| [`workflows/sistemas-backup-rotacion.json`](./workflows/sistemas-backup-rotacion.json) | ZIP diario + rotación 7 días + Drive + Gmail | Cadena completa documentada |
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
```

Comprueba en el buscador de nodos que aparecen **Local File Trigger** y **Execute Command**.


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

Cada pocos minutos comprobar URLs (y opcionalmente ping al router). Si fallan → Gmail.

### Flujo

```text
Schedule (5 min)
  → Definir objetivo (URL)
  → HTTP Request (GET, neverError)
  → Evaluar ok / statusCode
  → IF caído → Gmail alerta
```

### Importar

1. Importa `workflows/sistemas-uptime-health.json`.
2. Cambia la URL de prueba por la tuya (`http://localhost:5678` o tu web).
3. Credencial Gmail + destinatario.
4. Publish.

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

Con `ok: true` no se envía email (correcto).

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

## 2. Copias de seguridad con rotación

### Objetivo

Backup diario → comprimir ZIP local → (opcional) Google Drive → borrar ZIPs locales > N días → Gmail.

### Flujo (JSON importable)

```text
Schedule (03:00)
  → Rutas backup
  → Crear ZIP (backup-carpeta.ps1)
  → Parsear ruta ZIP
  → Leer ZIP disco
  → Subir a Google Drive
  → Rotacion +7 dias (rotar-backups.ps1)
  → Gmail backup OK (con enlace Drive)
```

### Importar

1. Crea las carpetas:
   - `C:\Users\chuwi\n8n-backup-origen` ← mete aquí lo que quieras respaldar
   - `C:\Users\chuwi\n8n-backups` ← se crea sola si falta
2. Arranca n8n con [`start-n8n.ps1`](./start-n8n.ps1) (hace falta **Execute Command** + allow-list de carpetas).
3. Importa [`workflows/sistemas-backup-rotacion.json`](./workflows/sistemas-backup-rotacion.json).
4. En **Rutas backup**, ajusta `sourcePath`, `backupDir` y `daysToKeep` si quieres.
5. Credencial Gmail + Drive + tu correo; comprueba que la cadena incluya Drive.
6. **Test workflow** (no hace falta esperar a las 03:00).
7. Publish.

Scripts: [`backup-carpeta.ps1`](./workflows/backup-carpeta.ps1), [`rotar-backups.ps1`](./workflows/rotar-backups.ps1).

### Google Drive

Detalle completo: [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md#6-google-drive--configuración-completa).

#### A) Habilitar Google Drive API (si falta → 403)

1. [Google Cloud Console](https://console.cloud.google.com/) → proyecto OAuth de n8n (prueba: `947509817186`).
2. **APIs & Services → Library** → **Google Drive API** → **Enable**.
3. Si sigue 403: Credentials → Google Drive → **Reconnect** / reautorizar.

#### B) Carpeta destino

URL de ejemplo ya usada:

```text
https://drive.google.com/drive/folders/18NmjbymVBtT4BTQuIHUg-7kEhFBswO2r
```

ID (solo esto): `18NmjbymVBtT4BTQuIHUg-7kEhFBswO2r` — **no** la URL de «Mi unidad».

#### C) Flujo de nodos (obligatorio en el canvas)

El email con *«no ejecutado»* aparece si Drive **no está en la cadena** (aunque lo hayas ejecutado a mano antes). Debe ser:

```text
Parsear ruta ZIP
  → Leer ZIP disco (Read/Write Files)
  → Subir a Google Drive   ← activo, no gris
  → Rotacion +7 dias
  → Gmail backup OK
```

En el canvas:

1. **Borra** el cable `Parsear ruta ZIP` → `Rotacion +7 dias` (si existe).
2. Conecta en ese orden: Parsear → Leer ZIP → Drive → Rotacion → Gmail.
3. Clic derecho en Drive → **Activate** (si sigue disabled).
4. En **Rotacion**, usa rutas desde Parsear:
   - `{{ $('Parsear ruta ZIP').item.json.backupDir }}`
   - `{{ $('Parsear ruta ZIP').item.json.daysToKeep }}`
   (tras Drive el `$json` ya no lleva `backupDir`).
5. **Test workflow** completo: en Executions, Drive debe aparecer en verde.

| Nodo | Parámetro | Valor |
|------|-----------|--------|
| Leer ZIP | File(s) Selector | `{{ $json.zipPathPosix }}` (sin espacio delante; con `/`) |
| Leer ZIP | Put Output File in Field | `data` |
| Drive | File / Upload | Input field = `data` |
| Drive | File Name | `{{ $('Parsear ruta ZIP').item.json.fileName }}` |
| Drive | Parent Drive | **By ID** = `root` |
| Drive | Parent Folder | **By ID** = `18NmjbymVBtT4BTQuIHUg-7kEhFBswO2r` |

**From list** en gris es normal; no hace falta. Un espacio delante de la ruta → `No file(s) found`. Arranque con allow-list vía `start-n8n.ps1` o las variables de Usuario.

#### D) Texto del email Gmail (sin la nota antigua)

En **Gmail backup OK → Message**, el cuerpo debe acabar con el enlace de Drive (no con «nodo desactivado»):

```text
Google Drive: {{ $('Subir a Google Drive').isExecuted ? ($('Subir a Google Drive').item.json.webViewLink || ('https://drive.google.com/open?id=' + $('Subir a Google Drive').item.json.id)) : 'no ejecutado (nodo desactivado o sin conectar en esta ejecución)' }}
```

Si el upload ya funciona (p. ej. [archivo en Drive](https://drive.google.com/open?id=1Fbhy6xTmLwObIrq5RJBsK2gekhleHg6x&usp=drive_copy)) pero el correo sigue mostrando la nota vieja, es solo texto fijo del nodo: edítalo o reimporta el JSON actualizado.

### PowerShell equivalente (referencia)

Rotación vía script (recomendado desde el nodo Execute Command; evita que n8n “coma” `$dir`/`$days`):

```powershell
powershell -NoProfile -File C:\Users\chuwi\Documents\n8n\workflows\rotar-backups.ps1 -BackupDir "C:\Users\chuwi\n8n-backups" -DaysToKeep 7
```

En el nodo **Rotacion +7 dias** (modo Expression `fx`):

```text
powershell -NoProfile -File "C:\Users\chuwi\Documents\n8n\workflows\rotar-backups.ps1" -BackupDir "{{ $('Parsear ruta ZIP').item.json.backupDir }}" -DaysToKeep {{ $('Parsear ruta ZIP').item.json.daysToKeep }}
```

No pongas la lógica de rotación en `-Command "... $dir = ..."` dentro de un campo `=`: n8n interpreta `$dir`/`$days` y rompe el comando.

### Base de datos

Si usas MySQL/Postgres, mejor un `.ps1` con `mysqldump` / `pg_dump` y que n8n ejecute solo:

```text
powershell -NoProfile -File C:\Scripts\backup-db.ps1
```

(secretos fuera del workflow).

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
| 1 Uptime | Schedule 5 min | HTTP 200 / ping | Gmail | `sistemas-uptime-health.json` |
| 2 Backup | Schedule 03:00 | zip + rotación (+ Drive opcional) | Gmail | `sistemas-backup-rotacion.json` |
| 3 Carpeta | Local File Trigger | Mover a procesados | Gmail | `sistemas-vigilancia-carpeta.json` |
| 4 Deploy | Webhook GitHub | `git pull` + docker | Gmail/Telegram | (manual) |
| 5 Logs | Schedule 1 h | Eventos 4625 / auth.log | Gmail crítico | (manual) |
