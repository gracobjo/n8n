# Crear ZIP de la carpeta origen (usado por el workflow n8n o a mano)
param(
  [string]$SourcePath = "$env:USERPROFILE\n8n-backup-origen",
  [string]$BackupDir = "$env:USERPROFILE\n8n-backups"
)

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "No existe la carpeta origen: $SourcePath"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$zip = Join-Path $BackupDir "backup_$stamp.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $SourcePath '*') -DestinationPath $zip -Force
Write-Output $zip
