# Manual de desarrollador — Automatización de sistemas (n8n local)

**Audiencia:** quien modifica workflows JSON, scripts PowerShell o la documentación del kit de sistemas.  
**Stack:** n8n 2.22.x self-hosted (Windows), PowerShell, Gmail/Drive/Telegram OAuth.  
**Índice técnico:** [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md) · Operativa: [`configurar-workflows-sistemas.md`](./configurar-workflows-sistemas.md) · Usuario: [`MANUAL_USUARIO_SISTEMAS.md`](./MANUAL_USUARIO_SISTEMAS.md)

---

## 1. Arquitectura lógica

```text
┌─────────────────────────────────────────────────────────────┐
│  PC Windows                                                 │
│  start-n8n.ps1 → env (NODES_EXCLUDE, RESTRICT, TZ) → n8n    │
│       │                                                     │
│       ├─ Workflows (JSON publicados)                        │
│       │    Uptime | Backup | Vigilancia | Telegram          │
│       ├─ Execute Command → backup-carpeta.ps1               │
│       │                 → rotar-backups.ps1                 │
│       └─ Read/Write Files (allow-list) → Drive upload       │
└───────────────┬─────────────────────┬───────────────────────┘
                │                     │
         Gmail / Telegram      Google Drive API
```

Los “componentes” de dominio no son clases Java: son **nodos n8n + scripts + estado en disco** (`.backup-state`). El diagrama de clases UML modela esas entidades (ver documentación técnica §7).

---

## 2. Mapa de artefactos

| Artefacto | Rol |
|-----------|-----|
| `workflows/sistemas-uptime-health.json` | Monitor HTTP + Gmail/Telegram |
| `workflows/sistemas-backup-rotacion.json` | Orquestación backup + Drive + retención |
| `workflows/sistemas-vigilancia-carpeta.json` | Local File Trigger → move → Gmail |
| `workflows/telegram-mensaje-programado.json` | Schedule → Telegram |
| `workflows/backup-carpeta.ps1` | Hash, modos full/diff/incr, symlinks, JSON stdout |
| `workflows/rotar-backups.ps1` | Retención local keep-1 + cascada `-AfterMode` |
| `workflows/seleccionar-retencion-drive.js` | Code: qué ZIPs borrar en Drive |
| `workflows/parsear-resultado-backup-canvas.js` | Code: parseo stdout (sin `$('Rutas…')`) |
| `start-n8n.ps1` | Arranque con env correctas |

Credenciales en JSON de plantilla usan placeholders (`REEMPLAZAR_ID_CREDENCIAL`, `PEGAR_ID_CARPETA_GOOGLE_DRIVE`). En el canvas real del usuario los IDs son los de su instancia.

---

## 3. Contrato del script `backup-carpeta.ps1`

### Entrada (parámetros)

| Parámetro | Default | Notas |
|-----------|---------|--------|
| `SourcePath` | `%USERPROFILE%\n8n-backup-origen` | Raíz; sigue symlinks/junctions |
| `BackupDir` | `%USERPROFILE%\n8n-backups` | ZIPs + `.backup-state` |
| `Mode` | `auto` | `auto\|full\|differential\|incremental` |
| `FullEveryDays` | `7` | Fuerza full si el último full es más antiguo |
| `ChatId` / `DaysToKeep` | — | Se reemitten en el JSON de salida |
| `Force` | off | Ignora skip por hash |
| `AllowBrokenLinks` | off | Si off, enlace USB/red caído → `status=error` |

### Salida

Última línea útil de stdout = JSON comprimido. Campos clave: `status` (`created`\|`skipped`\|`error`), `mode`, `reason`, `zipPath`, `contentHash`, `fileCount`, `sourceFileCount`, `cambios` (`added/modified/deleted*`), `linkedRoots`, `message`, `chatId`.

### Modo `auto` (Europe/Madrid)

| Día | Modo |
|-----|------|
| Domingo | full |
| Lunes–viernes | incremental |
| Sábado | differential |

Skip si `contentHash` = `state.lastContentHash` (salvo `-Force`).

### Symlinks

- Recorrido propio (no depender solo de `Get-ChildItem -Recurse`).
- Omite `*.lnk`.
- Rutas en ZIP = prefijo lógico bajo origen (`cuentas-usb\archivo.pdf`).

---

## 4. Contrato `rotar-backups.ps1`

```text
-BackupDir <path> -AfterMode full|differential|incremental
```

- Máx. 1 ZIP por tipo (`backup_full_*`, `backup_diff_*`, `backup_incr_*`).
- Tras `full`: borra todos diff e incr.
- Tras `differential`: borra todos incr.
- Elimina legado `backup_*.zip` sin sufijo de modo.

---

## 5. Workflow backup — puntos de extensión

Orden lógico publicado:

```text
Schedule → Rutas → Ejecutar backup → Parsear → IF fallo → IF ZIP
  → Leer → Drive upload → Listar Drive → Seleccionar retención
  → (IF borrar → Split → Borrar Drive → Resumen) → Rotación local
  → Gmail/Telegram OK
  → rama skip → Gmail/Telegram sin cambios
  → errores onError → Gmail/Telegram KO
```

### Parsear resultado

Usar código de `parsear-resultado-backup-canvas.js`: **no** referenciar `$('Rutas backup…')` (rompe si el Set se renombró). Todo sale del JSON del `.ps1`. Incluir `DEFAULT_CHAT_ID` como fallback.

### Execute Command

Pasar `-ChatId` y `-DaysToKeep` desde el Set. Evitar `$variables` PowerShell crudas en expresiones n8n (usan `$` de n8n): preferir `.ps1` con parámetros.

### Telegram

`parse_mode: HTML` (Markdown rompe con `_` en `backup_full_…`).

### Publish

Tras editar canvas → **Publish**. Los `.ps1` en disco se recogen en el próximo Execute sin Publish.

---

## 6. Entorno y seguridad

| Variable | Propósito |
|----------|-----------|
| `NODES_EXCLUDE=[]` | Habilita Local File Trigger y Execute Command |
| `N8N_RESTRICT_FILE_ACCESS_TO` | Allow-list Read/Write Files |
| `GENERIC_TIMEZONE=Europe/Madrid` | Schedules |
| `N8N_COMMUNITY_PACKAGES_ENABLED` | Paquetes comunidad |

Reglas:

- No interpolar input de Webhook público en shell.
- No commitear Client Secret / tokens reales.
- OAuth Gmail en modo Testing de Google Cloud caduca (~7 días) → Reconnect o app en Production.

---

## 7. Cómo añadir un nuevo origen (dev)

1. Documentar symlink en la guía (usuario lo crea en disco), **o**
2. Extender `backup-carpeta.ps1` con `-ExtraRoots` (lista de paths absolutos con prefijo en el manifest) si se quiere multi-root sin enlaces.
3. Tests manuales: carpeta pequeña → symlink → USB desconectado (debe `status=error`) → `-AllowBrokenLinks`.
4. Actualizar RF/CU en `documentacion-workflows-sistemas.md` y ambos manuales si cambia UX.
5. Commit + push del repo de trabajo del operador (`gracobjo/n8n` u origen correspondiente).

---

## 8. Pruebas mínimas de regresión

| Caso | Esperado |
|------|----------|
| Origen sin cambios | `skipped` + Telegram/Gmail sin cambios |
| Añadir fichero | `created` + conteos `+1` |
| Vaciar origen tras tener ficheros | `source_emptied` / mensaje ORIGEN VACIADO |
| Symlink a carpeta con 1 fichero | ZIP incluye `nombre-enlace\fichero` |
| Destino symlink ausente | `status=error`, rama KO |
| Segundo full | Drive/local sin diffs/incrs viejos (keep-1) |
| Gmail token muerto | Error OAuth en nodo Gmail; reconectar credencial |

---

## 9. Estilo de cambios en este kit

- Preferir documentar en español en `configurar-*` / `documentacion-*` / `MANUAL_*`.
- JSON de workflows: credenciales placeholder; el operador pega IDs reales en su canvas.
- No mezclar con el monorepo upstream de n8n (contribución a `n8n-io/n8n`) salvo que el cambio sea al producto n8n en sí.

---

## 10. Referencias rápidas

- UML (clases, CU, secuencia, actividad, despliegue): [`documentacion-workflows-sistemas.md` §7](./documentacion-workflows-sistemas.md#7-diagramas-uml)
- RF / RNF / CU detallados: mismo documento §§3–5
- Symlinks USB/red/URLs: [`configurar-workflows-sistemas.md`](./configurar-workflows-sistemas.md#enlaces-simbólicos--junctions-incluir-otras-carpetas-sin-copiarlas)
