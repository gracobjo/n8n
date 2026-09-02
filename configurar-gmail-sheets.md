# Configurar Gmail → Google Sheets en n8n

Guía para capturar emails de Gmail y guardarlos en Google Sheets con n8n en local.

## Tabla de contenidos

1. [Requisitos previos](#requisitos-previos)
2. [Configuración en Google Cloud Console](#configuración-en-google-cloud-console)
3. [Configuración de credenciales en n8n](#configuración-de-credenciales-en-n8n)
4. [Solución de problemas comunes](#solución-de-problemas-comunes)
5. [Creación del workflow](#creación-del-workflow)
6. [Configuración de nodos](#configuración-de-nodos)
7. [Expresiones utilizadas](#expresiones-utilizadas)
8. [Activación y pruebas](#activación-y-pruebas)
9. [Mejoras opcionales](#mejoras-opcionales)
10. [Troubleshooting avanzado](#troubleshooting-avanzado)
11. [Notas importantes](#notas-importantes)
12. [Recursos](#recursos)
13. [Resumen rápido](#resumen-rápido)

## Requisitos previos

- n8n ejecutándose en local (puerto `5678` por defecto)
- Cuenta de Google / Gmail
- Una hoja de cálculo de Google Sheets creada

## Configuración en Google Cloud Console

### 1. Crear proyecto y habilitar APIs

1. Abre [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un **nuevo proyecto** (por ejemplo, `n8n-local-automation`).
3. Ve a **APIs y servicios** → **Biblioteca**.
4. Busca y habilita:
   - **Gmail API**
   - **Google Sheets API**

### 2. Configurar la pantalla de consentimiento OAuth

1. Ve a **APIs y servicios** → **Pantalla de consentimiento de OAuth**.
2. Selecciona **Externo**.
3. Completa los campos obligatorios:
   - **Nombre de la aplicación**: `n8n`
   - **Correo electrónico de asistencia**: el de tu cuenta de Google
4. En **Ámbitos (Scopes)**, añade:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/spreadsheets`
5. En **Usuarios de prueba**, añade el mismo correo de Google que usarás en n8n.
6. Guarda los cambios.

### 3. Crear credenciales OAuth2

1. Ve a **Credenciales** → **Crear credenciales** → **ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. **Nombre**: `n8n-local`.
4. **URI de redirección autorizados** (debe coincidir exactamente):

   ```text
   http://localhost:5678/rest/oauth2-credential/callback
   ```

5. Haz clic en **Crear**.
6. Copia el **Client ID** y el **Client Secret**. Los necesitarás en n8n. No los subas a git ni los compartas.

## Configuración de credenciales en n8n

Crea **dos credenciales** distintas, aunque usen el mismo Client ID y Client Secret.

### Credencial 1: Gmail account

1. En n8n, ve a **Credentials** → **Create credential**.
2. Busca **Gmail OAuth2 API**.
3. Pega el Client ID y el Client Secret de Google Cloud.
4. Haz clic en **Connect my account** y autoriza el acceso.
5. Nómbrala, por ejemplo: `Gmail account`.

### Credencial 2: Google account (Sheets)

1. **Create credential** → busca **Google OAuth2 API** (la genérica).
2. Usa el mismo Client ID y Client Secret.
3. En **Scope**, añade:

   ```text
   https://www.googleapis.com/auth/spreadsheets
   ```

4. Haz clic en **Connect my account**.
5. Nómbrala, por ejemplo: `Google account`.

## Solución de problemas comunes

### Error: `redirect_uri_mismatch`

La URL de redirección no coincide con la registrada en Google Cloud.

1. Google Cloud Console → **Credenciales** → edita tu OAuth Client ID.
2. En **URI de redirección autorizados**, deja exactamente:

   ```text
   http://localhost:5678/rest/oauth2-credential/callback
   ```

3. Comprueba:
   - `http://` (no `https://`)
   - Puerto `5678` (o el que uses realmente)
   - Ruta exacta: `/rest/oauth2-credential/callback`
   - Sin barra final `/`
   - Sin espacios

### Error 403: `access_denied`

La app está en modo prueba y el correo no está autorizado.

1. Google Cloud Console → **Pantalla de consentimiento de OAuth**.
2. En **Usuarios de prueba**, añade el correo de Google que usas en n8n.
3. Guarda.

Si Google muestra **Google no ha verificado esta aplicación**:

1. Abre **Configuración avanzada** (Advanced).
2. Elige **Ir a n8n (no seguro)** (Go to n8n (unsafe)).
3. Pulsa **Permitir** (Allow).

### Error: `[undefined]` en la fecha

`internalDate` llega como string, no como número. Convierte antes de crear el `Date`:

```javascript
{{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES') }}
```

### Error: campo `textPlain` undefined

El nodo Gmail Trigger no siempre incluye `textPlain`. Usa `snippet` y limpia entidades HTML:

```javascript
{{ $json.snippet.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") }}
```

## Creación del workflow

### Paso 1: Preparar Google Sheets

1. Abre Google Sheets.
2. Crea una hoja, por ejemplo: `Registro de Emails`.
3. En la fila 1, añade encabezados:
   - `A1`: Fecha
   - `B1`: Remitente
   - `C1`: Asunto
   - `D1`: Contenido
4. Copia la URL del documento. Tiene esta forma:

   ```text
   https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
   ```

### Paso 2: Crear el workflow en n8n

1. Ve a **Workflows** → **Add workflow**.
2. Nómbralo, por ejemplo: `Gmail → Google Sheets`.

## Configuración de nodos

### Nodo 1: Gmail Trigger

1. Añade un nodo y busca **Gmail Trigger**.
2. Configura:
   - **Credential**: `Gmail account`
   - **Event**: `messageReceived`
   - **Simplify**: activado
   - **Max Emails per Poll**: `10`
3. En **Filters** → **Add Filter**:
   - **Read Status**: `Unread`
4. Envía un email de prueba a la cuenta y pulsa **Test step**.

### Nodo 2: Google Sheets

1. Añade un nodo **Google Sheets** después del trigger.
2. Configura:
   - **Credential**: `Google account` (la genérica)
   - **Operation**: `Append`
   - **Resource**: `Sheet Within Document`
   - **Document**: cambia de *From list* a *By URL* o *Define manually* y pega la URL de tu hoja
   - **Sheet**: el nombre exacto de la pestaña (`Hoja 1`, `Sheet1`, etc.)
3. Mapea las columnas:

   | Columna    | Expresión | Descripción |
   |------------|-----------|-------------|
   | Fecha      | `{{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES') }}` | Timestamp a fecha legible |
   | Remitente  | `{{ $json.From }}` | Nombre y email del remitente |
   | Asunto     | `{{ $json.Subject }}` | Asunto del email |
   | Contenido  | `{{ $json.snippet.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") }}` | Texto del snippet sin entidades HTML |

4. Pulsa **Test step** y comprueba que aparece una fila nueva en Sheets.

## Expresiones utilizadas

### Fecha formateada

```javascript
{{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES') }}
```

- `parseInt($json.internalDate)`: convierte el string a número (timestamp en milisegundos).
- `new Date(...)`: crea el objeto Date.
- `.toLocaleString('es-ES')`: formatea en español (por ejemplo, `1/9/2026, 14:16:33`).

### Contenido limpio (sin entidades HTML)

```javascript
{{ $json.snippet.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") }}
```

Reemplazos:

| Entidad | Resultado |
|---------|-----------|
| `&#39;` | `'` |
| `&amp;` | `&` |
| `&quot;` | `"` |
| `&lt;` | `<` |
| `&gt;` | `>` |

### Otras expresiones de fecha

Solo fecha (sin hora):

```javascript
{{ new Date(parseInt($json.internalDate)).toLocaleDateString('es-ES') }}
```

ISO completo:

```javascript
{{ new Date(parseInt($json.internalDate)).toISOString() }}
```

Formato personalizado:

```javascript
{{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
```

## Activación y pruebas

### Paso 1: Publicar el workflow

1. Arriba a la derecha, pulsa **Publish**.
2. Confirma el mensaje *Workflow published*.

### Paso 2: Verificar que está activo

- El estado debe mostrar **Published** (punto verde).
- El contador de ejecuciones aparece junto al editor (por ejemplo, `0/1`).

### Paso 3: Prueba en producción

1. Envía un email nuevo a la cuenta (desde otra cuenta o con otro asunto).
2. Déjalo **no leído**.
3. Espera 1–2 minutos: el trigger consulta Gmail periódicamente.
4. Abre Google Sheets: debería aparecer una fila nueva.
5. En n8n, abre la pestaña **Executions** y revisa la ejecución automática.

## Mejoras opcionales

### 1. Marcar el email como leído

Añade un tercer nodo **Gmail** después de Google Sheets:

- **Operation**: `Update`
- **Message ID**: `{{ $json.id }}`
- **Additional Fields** → **Labels**: `[]` (array vacío para quitar la etiqueta `UNREAD`)

### 2. Filtrar por palabras clave

En Gmail Trigger → **Filters** → **Search**:

```text
subject:"factura" OR from:"cliente@example.com"
```

### 3. Notificación a Telegram

Añade un nodo **Telegram** después de Google Sheets:

- **Operation**: `Send Message`
- **Chat ID**: el ID del chat de destino
- **Text**:

```text
Nuevo email guardado

De: {{ $json.From }}
Asunto: {{ $json.Subject }}
Fecha: {{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES') }}
```

### 4. Guardar adjuntos

Añade un nodo **Google Drive** o de ficheros:

- **Operation**: `Upload`
- **File Content**: `{{ $json.attachments }}`
- **File Name**: `{{ $json.subject }}-{{ $json.attachments[0].filename }}`

Con **Simplify** activado, los adjuntos pueden no venir en el payload. Si hace falta, desactiva Simplify o usa un nodo Gmail adicional para descargar el mensaje completo.

## Troubleshooting avanzado

### El workflow no se ejecuta automáticamente

Comprueba:

- El workflow está **publicado** (no solo en edición).
- El email está **no leído** (filtro Read Status: Unread).
- Las credenciales no han expirado.
- n8n sigue en ejecución.

Si falla:

- Revisa **Executions** en n8n.
- Mira la consola del proceso donde arrancaste n8n.

### Error de autenticación en Google Sheets

Causa habitual: scope insuficiente en la credencial.

1. **Credentials** → `Google account`.
2. Añade el scope si no está:

   ```text
   https://www.googleapis.com/auth/spreadsheets
   ```

3. Pulsa **Reconnect** y vuelve a autorizar.

### Los datos no aparecen en Google Sheets

Comprueba:

- La URL del documento es la correcta (`YOUR_SPREADSHEET_ID`).
- El nombre de la pestaña coincide exactamente (`Hoja 1` vs `Sheet1`).
- Las columnas están mapeadas.
- La cuenta de Google tiene permiso de edición sobre la hoja.

Prueba: ejecuta el nodo Google Sheets con **Test step**.

## Notas importantes

### Seguridad

- n8n en local: los datos del workflow no salen de tu máquina salvo las llamadas a Gmail y Sheets.
- OAuth2: Google gestiona la autenticación.
- No compartas el Client Secret.
- Mantén n8n actualizado.

### Rendimiento

- El Gmail Trigger hace polling cada 1–5 minutos (configurable).
- La Gmail API tiene cuota por proyecto; usa filtros para no procesar todos los emails.
- Filtrar por no leídos o por búsqueda reduce llamadas innecesarias.

### Mantenimiento

- Revisa **Executions** de vez en cuando.
- Si cambias la contraseña de Google o revocas el acceso, reconecta las credenciales.
- Si el workflow es crítico, configura una notificación cuando falle.

## Recursos

- [Documentación de n8n](https://docs.n8n.io/)
- [Nodo Gmail](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/)
- [Nodo Google Sheets](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/)
- [Expresiones en n8n](https://docs.n8n.io/code/)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Ámbito Gmail readonly](https://www.googleapis.com/auth/gmail.readonly)
- [Ámbito Google Sheets](https://www.googleapis.com/auth/spreadsheets)

## Resumen rápido

1. **Google Cloud**: proyecto → Gmail API + Sheets API → OAuth (consentimiento + credenciales) → URI `http://localhost:5678/rest/oauth2-credential/callback` → usuario de prueba.
2. **Credenciales n8n**: `Gmail OAuth2 API` y `Google OAuth2 API` (genérica, con scope de Sheets).
3. **Workflow**: Gmail Trigger (Unread) → Google Sheets (Append) → mapear columnas → publicar.
4. **Expresiones clave**:
   - Fecha: `{{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES') }}`
   - Contenido: snippet con `.replace()` de entidades HTML.
5. **Prueba**: email no leído → esperar 1–2 min → fila nueva en Sheets → revisar Executions.
