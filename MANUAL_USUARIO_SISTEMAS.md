# Manual de usuario — Automatización de sistemas (n8n local)

**Audiencia:** operador / usuario final que arranca n8n, recibe alertas y deja ficheros en carpetas vigiladas.  
**Producto:** suite de workflows de sistemas en n8n **2.22.x Self Hosted** (Windows).  
**Documentación técnica:** [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md) · Guía paso a paso: [`configurar-workflows-sistemas.md`](./configurar-workflows-sistemas.md)

---

## 1. Qué es esta aplicación

Es un conjunto de **automatizaciones locales** (no es n8n Cloud) que:

| Función | Qué notas tú |
|---------|----------------|
| **Uptime** | Si un servicio web cae, te llegan **Gmail + Telegram** |
| **Backup** | Cada noche (~03:00) respalda carpetas (y enlaces a USB/red); avisa OK / omitido / error |
| **Vigilancia de carpeta** | Dejas un archivo en `n8n-entradas` → se mueve a `n8n-procesados` + email |
| **Telegram programado** | Mensaje diario a una hora fija (opcional) |

No sustituye antivirus, SIEM ni un backup empresarial cifrado. Es un kit personal/operador en tu PC.

---

## 2. Arranque diario

1. Abre PowerShell y ejecuta:

```powershell
powershell -File C:\Users\chuwi\Documents\n8n\start-n8n.ps1
```

2. Espera a que n8n esté listo y abre el editor (normalmente `http://localhost:5678`).
3. Comprueba que los workflows importantes están **Active** y **Published** (en n8n 2.x el horario usa la versión publicada).

Si n8n no arranca o faltan nodos “Local File Trigger” / “Execute Command”, cierra la terminal, ábrela de nuevo (para cargar variables de Usuario) y vuelve a lanzar `start-n8n.ps1`.

---

## 3. Carpetas que debes conocer

| Carpeta | Para qué |
|---------|----------|
| `C:\Users\chuwi\n8n-backup-origen` | Lo que se respalda (ficheros + enlaces simbólicos) |
| `C:\Users\chuwi\n8n-backups` | ZIPs locales del backup |
| `C:\Users\chuwi\n8n-entradas` | Dejas aquí archivos nuevos (vigilancia) |
| `C:\Users\chuwi\n8n-procesados` | Destino tras mover el archivo |

---

## 4. Cómo usar cada función

### 4.1 Alertas de caída (Uptime)

- No tienes que hacer nada: corre solo cada ~5 minutos.
- Si el servicio está bien → **no** recibes mensaje.
- Si falla → email y/o Telegram con el nombre/URL.

**Si no llegan alertas de prueba:** revisa credencial Gmail/Telegram y que el workflow esté Published.

### 4.2 Backup nocturno

- Horario típico: **03:00** (zona `Europe/Madrid`).
- Tipos (modo `auto`):
  - **Domingo** → copia completa (full)
  - **Lunes–viernes** → incremental
  - **Sábado** → diferencial
- Si no cambió nada en origen → email/Telegram de **“sin cambios”** (no sube ZIP a Drive).
- Si hubo cambios → ZIP + (si está cableado) Google Drive + aviso **OK**.
- En Drive y en disco se guarda como máximo **1** full, **1** diff y **1** incr.

**Incluir otra carpeta, USB o red sin copiar archivos**

Crea un enlace simbólico dentro de `n8n-backup-origen` (PowerShell como admin si hace falta). Guía completa: [Enlaces simbólicos](./configurar-workflows-sistemas.md#enlaces-simbólicos--junctions-incluir-otras-carpetas-sin-copiarlas).

Ejemplo USB:

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$env:USERPROFILE\n8n-backup-origen\cuentas-usb" `
  -Target "D:\cuentas"
```

El USB debe estar conectado a la hora del backup; si no, fallará el escaneo (aviso KO).

**No uses** accesos directos `.lnk` del Explorador: el backup no sigue su contenido.

### 4.3 Vigilancia de carpeta

1. Copia o guarda un archivo en `n8n-entradas`.
2. En segundos debería desaparecer de entradas y aparecer en `n8n-procesados`.
3. Recibes un email con origen y destino.

### 4.4 Telegram programado

Mensaje a la hora configurada (p. ej. 09:00). Detalle: [`configurar-telegram-mensajes.md`](./configurar-telegram-mensajes.md).

---

## 5. Qué significan los avisos de backup

| Asunto / texto | Significado |
|----------------|-------------|
| Backup OK / created | Se generó ZIP (y suele haberse subido a Drive) |
| sin cambios / skipped | Origen igual que el último backup; no hay ZIP nuevo |
| ORIGEN VACIADO | Había ficheros y ahora el origen está vacío (o casi) |
| Backup KO / error | Falló script, lectura, Drive, Gmail OAuth, enlace USB/red, etc. |
| Retención Drive / local | Limpieza de ZIPs **antiguos de backup**, no de tu carpeta origen |

Si Gmail falla con *refresh token invalid/expired*: reconecta la credencial Gmail en n8n (Credentials → Reconnect). El backup puede haber funcionado igual; falló solo el correo.

---

## 6. Regla de oro: Publish

Tras **cualquier** cambio en el editor (texto de email, nodos, credenciales en el canvas):

1. Guarda  
2. Pulsa **Publish**  
3. Deja el workflow **Active**

Si no publicas, el Schedule de las 03:00 sigue con la versión antigua.

---

## 7. Problemas frecuentes

| Síntoma | Qué hacer |
|---------|-----------|
| No llega el mail de las 03:00 | ¿n8n estaba encendido? ¿Published? ¿Gmail OAuth vigente? |
| Skip aunque añadiste un fichero | ¿Está en `n8n-backup-origen` (o bajo un symlink), no en `Documents` suelto ni en `entradas`? |
| **Origen con ficheros, borré Drive, ejecuto y no hay ZIP ni subida** | Es el **skip por hash local**. Vaciar Drive **no** fuerza backup. Solución: borrar `%USERPROFILE%\n8n-backups\.backup-state` y volver a ejecutar el workflow (detalle en la [guía operativa](./configurar-workflows-sistemas.md#skip-por-hash-vs-drive-vacío)). |
| Error de enlace / path not found | USB desconectado o ruta de red caída |
| Drive 404 | Carpeta de Drive borrada; crear otra y actualizar el ID en el nodo |
| Local File Trigger “not installed” | Arrancar con `start-n8n.ps1` / `NODES_EXCLUDE=[]` |
| Gmail *refresh token invalid* | Credentials → Gmail → Reconnect (el backup pudo haberse hecho igual) |

---

## 8. Privacidad y seguridad (usuario)

- Las credenciales viven en tu instancia local de n8n.
- No compartas capturas con tokens, Client Secret o `chat_id` públicos innecesarios.
- No dejes el PC apagado si dependes del Schedule a las 03:00 (n8n debe estar en marcha).

---

## 9. Dónde pedir más detalle

| Necesitas… | Documento |
|------------|-----------|
| Montar o cambiar un workflow | [`configurar-workflows-sistemas.md`](./configurar-workflows-sistemas.md) |
| RF, RNF, UML, casos de uso | [`documentacion-workflows-sistemas.md`](./documentacion-workflows-sistemas.md) |
| Extender scripts / canvas | [`MANUAL_DESARROLLADOR_SISTEMAS.md`](./MANUAL_DESARROLLADOR_SISTEMAS.md) |
