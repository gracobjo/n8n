# Mensajes programados por Telegram en n8n

Workflow mínimo: **Schedule → texto → Telegram Send Message**.

**JSON importable:** [`workflows/telegram-mensaje-programado.json`](./workflows/telegram-mensaje-programado.json)

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

## 3. Credencial en n8n

1. **Credentials → Add → Telegram API**.
2. Pega el **Access Token** del BotFather.
3. Guarda.

## 4. Importar y probar

1. Importa [`workflows/telegram-mensaje-programado.json`](./workflows/telegram-mensaje-programado.json).
2. Nodo **Mensaje**:
   - `chatId` → tu número (sin comillas raras).
   - `texto` → lo que quieras enviar.
3. Nodo **Telegram Send Message** → elige la credencial.
4. **Test workflow** (no hace falta esperar a las 09:00).
5. Si llega el mensaje → **Publish**.

Por defecto el Schedule dispara **cada día a las 09:00** (hora del servidor donde corre n8n).

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
| **Entradas** | Token bot, chat_id, horario, texto |
| **Salidas** | Mensaje en Telegram |

---

## Problemas frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| 401 / Unauthorized | Token mal pegado o credencial incorrecta |
| chat not found | No has escrito nunca al bot; o chat_id incorrecto |
| No llega a la hora | Workflow no Published; zona horaria del PC/servidor; Schedule mal |
| Grupo no recibe | Añade el bot al grupo; usa el chat_id del grupo (negativo) |
