# Retencion local de ZIPs de backup (NO borra ficheros de la carpeta origen).
# Politica keep-latest: como maximo 1 full + 1 diff + 1 incr.
# Tras un FULL nuevo: borra todos los diff e incr.
# Tras un DIFF nuevo: borra todos los incr (la diff ya cubre la semana).
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,

  [ValidateSet('', 'full', 'differential', 'incremental', 'none')]
  [string]$AfterMode = '',

  [switch]$KeepLatestOnly
)

# Por defecto siempre keep-latest (el switch queda por compatibilidad de llamadas antiguas)
$KeepLatestOnly = $true

if (-not (Test-Path -LiteralPath $BackupDir)) {
  Write-Output "Retencion ZIPs locales: carpeta de backups no existe ($BackupDir). No se borro nada."
  Write-Output "deleted=0; files="
  exit 0
}

$removed = [System.Collections.Generic.List[string]]::new()

function Remove-FileSafe([System.IO.FileInfo]$File) {
  Remove-Item -LiteralPath $File.FullName -Force
  $script:removed.Add($File.Name) | Out-Null
}

function Keep-Newest([string]$Filter, [int]$Keep = 1) {
  $files = @(
    Get-ChildItem -LiteralPath $BackupDir -File -Filter $Filter -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
  )
  if ($files.Count -le $Keep) { return }
  foreach ($f in ($files | Select-Object -Skip $Keep)) {
    Remove-FileSafe $f
  }
}

function Remove-AllMatching([string]$Filter) {
  Get-ChildItem -LiteralPath $BackupDir -File -Filter $Filter -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-FileSafe $_ }
}

# Cascada segun el ZIP recien creado
switch ($AfterMode) {
  'full' {
    Remove-AllMatching 'backup_diff_*.zip'
    Remove-AllMatching 'backup_incr_*.zip'
  }
  'differential' {
    Remove-AllMatching 'backup_incr_*.zip'
  }
}

# Como maximo 1 de cada tipo (incluye legado: no se conserva)
Keep-Newest -Filter 'backup_full_*.zip' -Keep 1
Keep-Newest -Filter 'backup_diff_*.zip' -Keep 1
Keep-Newest -Filter 'backup_incr_*.zip' -Keep 1

Get-ChildItem -LiteralPath $BackupDir -File -Filter 'backup_*.zip' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch '^backup_(full|diff|incr)_' } |
  ForEach-Object { Remove-FileSafe $_ }

$policy = "politica: max 1 full + 1 diff + 1 incr; afterMode=$AfterMode (full limpia diff/incr; diff limpia incr)"
if ($removed.Count -eq 0) {
  Write-Output "Retencion ZIPs locales (NO es el origen): ningun ZIP eliminado. $policy"
} else {
  Write-Output "Retencion ZIPs locales (NO es el origen): eliminados $($removed.Count) ZIP(s): $($removed -join ', '). $policy"
}
Write-Output ("deleted=$($removed.Count); files=$($removed -join ',')")
