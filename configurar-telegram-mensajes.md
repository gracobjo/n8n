# Mensajes programados por Telegram en n8n

Workflow mínimo: **Schedule → texto → Telegram Send Message**.

**JSON importable:** [`workflows/telegram-mensaje-programado.json`](./workflows/telegram-mensaje-programado.json)

---

## Dónde se configura cada cosa

Mapa rápido (lo que más confunde: **Settings del nodo ≠ Settings del workflow**).

| Qué | Dónde en n8n / sistema | Valor de ejemplo |
|-----|------------------------|------------------|
| **Token del bot** | Credentials → **Telegram API** → Access Token | Lo da [@BotFather](https://t.me/BotFather) |
| **Credencial en el envío** | Nodo **Telegram Send Message** → Credential | Elige la cuenta Telegram guardada |
| **`chat_id`** | Nodo **Mensaje** (Set) → campo `chatId` **o** nodo Telegram → Chat ID (Fixed) | `328226271` (número de `chat.id`, no el id del bot) |
| **Texto del mensaje** | Nodo **Mensaje** → `texto` | Cualquier string |
| **Hora del disparo** | Nodo **Schedule 09:00** → intervalo / hora / minuto | Diario 09:00 |
| **Timezone del Schedule** (instancia) | Variable `GENERIC_TIMEZONE` + [`start-n8n.ps1`](./start-n8n.ps1); reiniciar n8n | `Europe/Madrid` |
| **Timezone del Schedule** (este workflow) | Canvas → menú **⋯** o engranaje del **workflow** (arriba) → **Settings** → Timezone | `Europe/Madrid` |
| **Hora impresa en el texto** | Nodo Telegram → campo **Text** → expresión `$now.setZone(...)` | Ver abajo |
| **Publish / activo** | Interruptor Active del workflow | Debe estar ON para las 09:00 automáticas |

### Qué NO es el timezone

| Sitio | ¿Timezone? |
|-------|------------|
| Tab **Settings** del nodo **Telegram Send Message** | No |
| Tab **Parameters** del Telegram (Chat ID, Text, Reply Markup) | No (salvo que pongas `setZone` en el Text) |
| Settings del **workflow** (⋯ del canvas) | Sí |
| `GENERIC_TIMEZONE` / `start-n8n.ps1` | Sí (toda la instancia) |

### Expresión de hora en España (campo Text)

```text
{{ $json.texto }}

Hora: {{ $now.setZone('Europe/Madrid').toFormat('dd/MM/yyyy HH:mm') }}
```

Canarias: `Atlantic/Canary`.

---

## 1. Crear el bot

1. En Telegram, abre [@BotFather](https://t.me/BotFather).
2. `/newbot` → nombre y username (debe acabar en `bot`).
3. Copia el **token** (`123456:ABC-DEF...`).

## 2. Obtener tu `chat_id`

1. Habla con tu bot (abre el chat y pulsa Start / envía cualquier mensaje).
2. Opción rápida: abre en el navegador (sustituye `TOKEN`):

```text
https://api.telegram.org/botTOKEN/getUpdates
```

3. En el JSON busca `"chat":{"id": 123456789}` — ese número es el **chat_id** (en grupos suele ser negativo).
4. **No** uses el `from.id` del bot (p. ej. `8712424779`); usa el `chat.id` del usuario/grupo.

## 3. Credencial en n8n

1. **Credentials → Add → Telegram API**.
2. Pega el **Access Token** del BotFather.
3. Guarda.

## 4. Importar y probar

1. Importa [`workflows/telegram-mensaje-programado.json`](./workflows/telegram-mensaje-programado.json).
2. Nodo **Mensaje**:
   - `chatId` → tu número (sin comillas raras).
   - `texto` → lo que quieras enviar.
3. Nodo **Telegram Send Message** → elige la credencial; Chat ID suele ser `{{ $json.chatId }}`.
4. Opcional: canvas → **⋯ → Settings → Timezone** = `Europe/Madrid`.
5. **Test workflow** (no hace falta esperar a las 09:00).
6. Si llega el mensaje → **Publish**.

Por defecto el Schedule dispara **cada día a las 09:00**. Con `GENERIC_TIMEZONE=Europe/Madrid` (y reinicio) esa hora es España peninsular.

### Timezone España (detalle)

n8n usa por defecto `America/New_York` si no se configura nada.

1. **Instancia (recomendado):**  
   `$env:GENERIC_TIMEZONE = 'Europe/Madrid'` en [`start-n8n.ps1`](./start-n8n.ps1) y variable de Usuario Windows.  
   Tras cambiarla: **cerrar n8n** y volver a arrancar con el script.
2. **Por workflow:** ⋯ del canvas → Settings → Timezone → `Europe/Madrid`.
3. **Solo el reloj del mensaje:** expresión `setZone` en el Text (tabla de arriba).

---

## Variantes útiles

| Variante | Cómo |
|----------|------|
| Solo probar a mano | Añade **Manual Trigger** en paralelo al Schedule, o usa Test workflow |
| Varias veces al día | Schedule → otro intervalo (horas/minutos) o varios triggers |
| Cron fino | Schedule → Custom cron, ej. `0 9 * * 1-5` (laborables 09:00) |
| Misma alerta que Gmail | Tras el IF de uptime/backup/scraping, añade otro nodo Telegram con el mismo texto |
| Resumen diario | Schedule 08:00 → leer Sheets/estado → un solo `Send Message` |

### Ejemplo: alerta de uptime también a Telegram

En el workflow de uptime, después del IF “caído”:

```text
IF caído
  → Gmail alerta
  → Telegram Send Message   (mismo chatId / otro)
```

Texto ejemplo:

```text
⚠️ Caído: {{ $('Definir objetivo').item.json.nombre }}
URL: {{ $('Definir objetivo').item.json.url }}
```

---

## Qué hace / qué no hace

| | |
|--|--|
| **Qué hace** | Envía un texto a tu chat de Telegram a la hora programada |
| **Qué no hace** | No es un bot conversacional; no escucha comandos (para eso haría falta **Telegram Trigger**); no sustituye Gmail |
| **Entradas** | Token bot, chat_id, horario, texto, timezone |
| **Salidas** | Mensaje en Telegram |

---

## Problemas frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| 401 / Unauthorized | Token mal pegado o credencial incorrecta |
| chat not found | No has escrito al bot; chat_id incorrecto; usaste el id del bot en vez de `chat.id` |
| Hora del mensaje en NY (−4/−5) | Falta `setZone('Europe/Madrid')` en Text **o** no reiniciaste tras `GENERIC_TIMEZONE` |
| Schedule a hora “rara” | Timezone instancia/workflow; no busques timezone en Settings del **nodo** Telegram |
| No llega a la hora | Workflow no Published; Schedule mal |
| Grupo no recibe | Añade el bot al grupo; chat_id del grupo (negativo) |
