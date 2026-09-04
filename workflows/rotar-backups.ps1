param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDir,

  [Parameter(Mandatory = $false)]
  [int]$DaysToKeep = 7
)

if (-not (Test-Path -LiteralPath $BackupDir)) {
  Write-Output "deleted=0; files=; note=backupDir-missing"
  exit 0
}

$limit = (Get-Date).AddDays(-1 * $DaysToKeep)
$removed = @()

Get-ChildItem -LiteralPath $BackupDir -File -Filter 'backup_*.zip' |
  Where-Object { $_.LastWriteTime -lt $limit } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    $removed += $_.Name
  }

Write-Output ("deleted=$($removed.Count); files=$($removed -join ',')")
