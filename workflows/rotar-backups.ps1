# Retencion local de ZIPs de backup (NO borra ficheros de la carpeta origen).
# Purge: full 28d / diff 14d / incr 7d / legado 7d (ajustable por parametros).
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,

  [int]$DaysToKeepFull = 28,
  [int]$DaysToKeepDiff = 14,
  [int]$DaysToKeepIncr = 7,
  [int]$DaysToKeepLegacy = 7
)

if (-not (Test-Path -LiteralPath $BackupDir)) {
  Write-Output "Retencion ZIPs locales: carpeta de backups no existe ($BackupDir). No se borro nada."
  Write-Output "deleted=0; files="
  exit 0
}

$removed = @()
function Remove-Old([string]$Filter, [int]$Days) {
  $limit = (Get-Date).AddDays(-1 * $Days)
  Get-ChildItem -LiteralPath $BackupDir -File -Filter $Filter -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $limit } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
      $script:removed += $_.Name
    }
}

Remove-Old -Filter 'backup_full_*.zip' -Days $DaysToKeepFull
Remove-Old -Filter 'backup_diff_*.zip' -Days $DaysToKeepDiff
Remove-Old -Filter 'backup_incr_*.zip' -Days $DaysToKeepIncr
# Legado: backup_YYYY... sin sufijo de modo (no coincidir con full/diff/incr)
Get-ChildItem -LiteralPath $BackupDir -File -Filter 'backup_*.zip' -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -notmatch '^backup_(full|diff|incr)_' -and
    $_.LastWriteTime -lt (Get-Date).AddDays(-1 * $DaysToKeepLegacy)
  } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $removed += $_.Name
  }

$policy = "politica: full ${DaysToKeepFull}d / diff ${DaysToKeepDiff}d / incr ${DaysToKeepIncr}d / legado ${DaysToKeepLegacy}d"
if ($removed.Count -eq 0) {
  Write-Output "Retencion ZIPs locales (NO es el origen): ningun ZIP antiguo eliminado. $policy"
} else {
  Write-Output "Retencion ZIPs locales (NO es el origen): eliminados $($removed.Count) ZIP(s) caducados: $($removed -join ', '). $policy"
}
Write-Output ("deleted=$($removed.Count); files=$($removed -join ',')")
