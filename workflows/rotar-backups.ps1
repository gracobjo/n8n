# Rotacion de backups full / diff / incr (y legado backup_*.zip)
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,

  [int]$DaysToKeepFull = 28,
  [int]$DaysToKeepDiff = 14,
  [int]$DaysToKeepIncr = 7,
  [int]$DaysToKeepLegacy = 7
)

if (-not (Test-Path -LiteralPath $BackupDir)) {
  Write-Output "deleted=0; files=; note=backupDir-missing"
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

Write-Output ("deleted=$($removed.Count); files=$($removed -join ',')")
