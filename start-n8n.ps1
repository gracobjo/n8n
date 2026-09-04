# start-n8n.ps1 — arranque recomendado (sistemas + community nodes)
# Uso: powershell -File C:\Users\chuwi\Documents\n8n\start-n8n.ps1
# Las variables también pueden quedar fijas a nivel Usuario (ver documentacion-workflows-sistemas.md)

$env:NODES_EXCLUDE = '[]'
$env:N8N_RESTRICT_FILE_ACCESS_TO = @(
  "$env:USERPROFILE\n8n-backups",
  "$env:USERPROFILE\n8n-backup-origen",
  "$env:USERPROFILE\n8n-entradas",
  "$env:USERPROFILE\n8n-procesados",
  "$env:USERPROFILE\.n8n-files"
) -join ';'
$env:N8N_COMMUNITY_PACKAGES_ENABLED = 'true'
$env:GENERIC_TIMEZONE = 'Europe/Madrid'

Write-Host "NODES_EXCLUDE=$env:NODES_EXCLUDE"
Write-Host "N8N_RESTRICT_FILE_ACCESS_TO=$env:N8N_RESTRICT_FILE_ACCESS_TO"
Write-Host "GENERIC_TIMEZONE=$env:GENERIC_TIMEZONE"
Write-Host "Starting n8n..."
npx n8n
