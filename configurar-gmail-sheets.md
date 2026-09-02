Aquí tienes el archivo markdown completo con toda la documentación del proceso:
markdown

12345678910111213141516171819202122232425262728293031323334353637383940414243444546
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/spreadsheets

123456789
http://localhost:5678/rest/oauth2-credential/callback

1234567891011121314151617181920212223
https://www.googleapis.com/auth/spreadsheets

1234567891011121314
http://localhost:5678/rest/oauth2-credential/callback

1234567891011121314151617181920212223242526272829303132
Error: Campo textPlain undefined
Problema: El Gmail Trigger no siempre incluye textPlain.
Solución: Usa snippet y limpia los códigos HTML:
javascript

1
Creación del Workflow
Paso 1: Preparar Google Sheets
Abre Google Sheets
Crea una nueva hoja: Registro de Emails
En la fila 1, añade encabezados:
A1: Fecha
B1: Remitente
C1: Asunto
D1: Contenido
Copia la URL de la hoja (ej: https://docs.google.com/spreadsheets/d/1PLOygLjsIZHtuaTur9EjBXfaD14AmO1taXWsxil-wIk/edit)
Paso 2: Crear Workflow en n8n
Ve a Workflows → Add workflow
Nómbralo: Gmail → Google Sheets
Configuración de Nodos
Nodo 1: Gmail Trigger
Haz clic en "+" para añadir nodo
Busca: Gmail Trigger
Configura:
Parámetros:
Credential: Gmail account
Event: messageReceived
Simplify: Activado (ON)
Max Emails per Poll: 10
Filters:
Haz clic en Add Filter
Selecciona: Read Status
Elige: Unread (solo emails no leídos)
Haz clic en Test step (envíate un email de prueba primero)
Nodo 2: Google Sheets
Haz clic en el "+" después del nodo Gmail
Busca: Google Sheets
Configura:
Parámetros:
Credential: Google account (la genérica)
Operation: Append (Añadir fila)
Resource: Sheet Within Document
Document:
Cambia "From list" a "By URL" o "Define manually"
Pega la URL de tu Google Sheet:

1
Sheet:
Selecciona: Hoja 1 (o el nombre exacto de tu hoja)
Columns (Mapeo de campos):
Para cada columna, haz clic en el campo y arrastra desde el panel derecho o usa estas expresiones:
Columna
Expresión
Descripción
Fecha
{{ new Date(parseInt($json.internalDate)).toLocaleString('es-ES') }}
Convierte timestamp a fecha legible
Remitente
{{ $json.From }}
Email y nombre del remitente
Asunto
{{ $json.Subject }}
Asunto del email
Contenido
{{ $json.snippet.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") }}
Texto del email limpio
Haz clic en Test step
Verifica en Google Sheets que aparezca una nueva fila
Expresiones Utilizadas
Fecha Formateada
javascript

1
Explicación:
parseInt($json.internalDate): Convierte el string a número (timestamp en milisegundos)
new Date(): Crea objeto Date
.toLocaleString('es-ES'): Formatea en español (ej: 1/9/2026, 14:16:33)
Contenido Limpio (sin HTML entities)
javascript

1
Explicación:
Reemplaza códigos HTML por caracteres normales
&#39; → ' (apóstrofe)
&amp; → & (ampersand)
&quot; → " (comillas)
&lt; → < (menor que)
&gt; → > (mayor que)
Otras Expresiones Disponibles
javascript

1234567891011121314
Activación y Pruebas
Paso 1: Publicar Workflow
En la esquina superior derecha, haz clic en Publish
Aparecerá el mensaje: "Workflow published"
Haz clic en Got it
Paso 2: Verificar que Está Activo
El botón Publish cambiará de estado
En la esquina superior derecha verás: Published (con un punto verde)
El contador mostrará algo como: 0/1 (ejecuciones exitosas/total)
Paso 3: Prueba en Producción
Envíate un email nuevo a tu cuenta de Gmail
Desde otra cuenta o con asunto diferente
Asegúrate de que esté no leído
Espera 1-2 minutos (el trigger consulta Gmail periódicamente)
Abre tu Google Sheets
Debería aparecer una nueva fila con los datos del email
Verifica en n8n:
Ve a la pestaña Executions (arriba, al lado de Editor)
Verás el registro de la ejecución automática
Mejoras Opcionales
1. Marcar Email como Leído
Añade un tercer nodo después de Google Sheets:
Nodo: Gmail
Operation: Update
Message ID: {{ $json.id }}
Additional Fields:
Labels: [] (array vacío para quitar la etiqueta UNREAD)
2. Filtrar por Palabras Clave
En el Gmail Trigger → Filters → Search:

1
3. Enviar Notificación a Telegram
Añade un nodo Telegram después de Google Sheets:
Operation: Send Message
Chat ID: Tu chat ID
Text:

12345
4. Guardar Adjuntos
Añade un nodo Google Drive o Files:
Operation: Upload
File Content: {{ $json.attachments }}
File Name: {{ $json.subject }}-{{ $json.attachments[0].filename }}
Troubleshooting Avanzado
El workflow no se ejecuta automáticamente
Verificaciones:
✅ Workflow está Publicado (no en modo edición)
✅ Email está no leído (filtro Read Status: Unread)
✅ Credenciales están vigentes (no han expirado)
✅ n8n está ejecutándose en segundo plano
Solución:
Ve a Settings → Executions → Verifica si hay errores
Revisa la consola de n8n (terminal donde lo iniciaste)
Error de autenticación en Google Sheets
Causa: Scope insuficiente en la credencial
Solución:
Ve a Credentials → Google account
Añade el scope si no está:

1
Haz clic en Reconnect y reautoriza
Los datos no aparecen en Google Sheets
Verificaciones:
✅ URL del documento es correcta
✅ Nombre de la hoja es exacto (Hoja 1 vs Sheet1)
✅ Columnas están mapeadas correctamente
✅ La hoja tiene permisos de edición para tu cuenta
Prueba: Ejecuta manualmente el nodo Google Sheets con Test step
Notas Importantes
Seguridad
✅ n8n en local = tus datos no salen de tu máquina
✅ Credenciales OAuth2 = Google gestiona la autenticación
⚠️ No compartas tu Client Secret
⚠️ Mantén n8n actualizado
Rendimiento
Polling: El Gmail Trigger consulta cada 1-5 minutos (configurable)
Límites: Gmail API tiene cuota de ~1 billón de requests/día (más que suficiente)
Optimización: Usa filtros para procesar solo emails relevantes
Mantenimiento
Revisa logs: Ve a Executions periódicamente
Actualiza credenciales: Si cambias contraseña de Google, reconecta
Monitorea errores: Configura notificaciones si el workflow falla
Recursos Útiles
Documentación n8n: https://docs.n8n.io/
Nodo Gmail: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/
Nodo Google Sheets: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/
Expresiones en n8n: https://docs.n8n.io/code-examples/expressions/
Google Cloud Console: https://console.cloud.google.com/
Resumen Rápido

12345678910111213141516171819202122232425