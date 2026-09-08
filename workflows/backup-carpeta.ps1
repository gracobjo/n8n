# Backup de carpeta: full / diferencial / incremental + skip si el hash no cambia.
# Salida (última línea útil): JSON con status, mode, zipPath, contentHash, etc.
# Uso:
#   .\backup-carpeta.ps1 -SourcePath ... -BackupDir ... -Mode auto
# Modes: auto | full | differential | incremental
# auto: skip si sin cambios; full cada FullEveryDays (default 7) o si no hay full; si no → differential

param(
  [string]$SourcePath = "$env:USERPROFILE\n8n-backup-origen",
  [string]$BackupDir = "$env:USERPROFILE\n8n-backups",
  [ValidateSet('auto', 'full', 'differential', 'incremental')]
  [string]$Mode = 'auto',
  [int]$FullEveryDays = 7,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FileSha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-RelativePath([string]$Root, [string]$Full) {
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $fileFull = [System.IO.Path]::GetFullPath($Full)
  if ($fileFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fileFull.Substring($rootFull.Length).TrimStart('\', '/').Replace('\', '/')
  }
  return $fileFull.Replace('\', '/')
}

function Build-Manifest([string]$Root) {
  $entries = @()
  Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction Stop |
    Sort-Object FullName |
    ForEach-Object {
      $rel = Get-RelativePath -Root $Root -Full $_.FullName
      $hash = Get-FileSha256 $_.FullName
      $entries += [pscustomobject]@{
        path         = $rel
        sha256       = $hash
        length       = [int64]$_.Length
        lastWriteUtc = $_.LastWriteTimeUtc.ToString('o')
      }
    }
  $payload = ($entries | ForEach-Object { "$($_.path)|$($_.sha256)|$($_.length)" }) -join "`n"
  $contentHash = if ([string]::IsNullOrEmpty($payload)) {
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  } else {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
      $sha.Dispose()
    }
  }
  return [pscustomobject]@{
    createdAt    = (Get-Date).ToUniversalTime().ToString('o')
    root         = [System.IO.Path]::GetFullPath($Root)
    contentHash  = $contentHash
    fileCount    = $entries.Count
    files        = $entries
  }
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-JsonFile([string]$Path, $Object) {
  $dir = Split-Path -Parent $Path
  if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  ($Object | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-ChangedFiles($CurrentManifest, $BaselineManifest) {
  if ($null -eq $BaselineManifest -or $null -eq $BaselineManifest.files) {
    return @($CurrentManifest.files)
  }
  $baseMap = @{}
  foreach ($f in $BaselineManifest.files) {
    $baseMap[$f.path] = $f.sha256
  }
  $changed = @()
  foreach ($f in $CurrentManifest.files) {
    if (-not $baseMap.ContainsKey($f.path) -or $baseMap[$f.path] -ne $f.sha256) {
      $changed += $f
    }
  }
  return $changed
}

function Get-ChangeSummary($CurrentManifest, $PreviousManifest) {
  $added = @()
  $modified = @()
  $deleted = @()
  $prevCount = 0

  if ($null -eq $PreviousManifest -or $null -eq $PreviousManifest.files) {
    $added = @($CurrentManifest.files | ForEach-Object { $_.path })
    return [pscustomobject]@{
      previousFileCount = 0
      addedCount        = $added.Count
      modifiedCount     = 0
      deletedCount      = 0
      addedPaths        = @($added)
      modifiedPaths     = @()
      deletedPaths      = @()
      sourceEmptied     = $false
    }
  }

  $prevCount = @($PreviousManifest.files).Count
  $prevMap = @{}
  foreach ($f in $PreviousManifest.files) {
    $prevMap[$f.path] = $f.sha256
  }
  $currMap = @{}
  foreach ($f in $CurrentManifest.files) {
    $currMap[$f.path] = $f.sha256
    if (-not $prevMap.ContainsKey($f.path)) {
      $added += $f.path
    } elseif ($prevMap[$f.path] -ne $f.sha256) {
      $modified += $f.path
    }
  }
  foreach ($f in $PreviousManifest.files) {
    if (-not $currMap.ContainsKey($f.path)) {
      $deleted += $f.path
    }
  }

  return [pscustomobject]@{
    previousFileCount = $prevCount
    addedCount        = $added.Count
    modifiedCount     = $modified.Count
    deletedCount      = $deleted.Count
    addedPaths        = @($added)
    modifiedPaths     = @($modified)
    deletedPaths      = @($deleted)
    sourceEmptied     = ($prevCount -gt 0 -and $CurrentManifest.fileCount -eq 0)
  }
}

function Format-ChangeMessage($Summary, [string]$ResolvedMode, [int]$ZipFileCount) {
  $parts = @("Backup $ResolvedMode creado ($ZipFileCount archivos en ZIP).")
  if ($Summary.sourceEmptied) {
    $parts += "Origen vaciado: se borraron $($Summary.deletedCount) archivo(s) respecto al backup anterior (antes $($Summary.previousFileCount), ahora 0)."
  } elseif ($Summary.deletedCount -gt 0 -or $Summary.addedCount -gt 0 -or $Summary.modifiedCount -gt 0) {
    $parts += "Cambios vs anterior: +$($Summary.addedCount) ~$($Summary.modifiedCount) -$($Summary.deletedCount) (antes $($Summary.previousFileCount) archivos)."
  }
  return ($parts -join ' ')
}

function New-ZipFromRelativeFiles([string]$Root, [object[]]$Files, [string]$ZipPath) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
  $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($f in $Files) {
      $abs = Join-Path $Root (($f.path -replace '/', '\'))
      if (-not (Test-Path -LiteralPath $abs)) { continue }
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $abs,
        $f.path.Replace('\', '/'),
        [System.IO.Compression.CompressionLevel]::Optimal
      )
    }
  } finally {
    $zip.Dispose()
  }
}

function Emit-Result($Object) {
  $json = ($Object | ConvertTo-Json -Compress -Depth 6)
  Write-Output $json
}

# --- main ---
if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "No existe la carpeta origen: $SourcePath"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stateDir = Join-Path $BackupDir '.backup-state'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$statePath = Join-Path $stateDir 'state.json'
$manifestCurrentPath = Join-Path $stateDir 'manifest-current.json'
$manifestLastFullPath = Join-Path $stateDir 'manifest-last-full.json'
$manifestLastBackupPath = Join-Path $stateDir 'manifest-last-backup.json'

$state = Read-JsonFile $statePath
if ($null -eq $state) {
  $state = [pscustomobject]@{
    lastContentHash = $null
    lastMode        = $null
    lastZip         = $null
    lastBackupAt    = $null
    lastFullAt      = $null
    lastFullZip     = $null
  }
}

Write-Host "Escaneando y hasheando: $SourcePath"
$manifest = Build-Manifest -Root $SourcePath
Write-JsonFile -Path $manifestCurrentPath -Object $manifest

$previousManifest = Read-JsonFile $manifestLastBackupPath
if ($null -eq $previousManifest) {
  $previousManifest = Read-JsonFile $manifestLastFullPath
}
$changeSummary = Get-ChangeSummary -CurrentManifest $manifest -PreviousManifest $previousManifest

$unchanged = (-not $Force) -and
  $state.lastContentHash -and
  ($state.lastContentHash -eq $manifest.contentHash)

if ($unchanged) {
  Emit-Result ([pscustomobject]@{
      status          = 'skipped'
      reason          = 'unchanged'
      mode            = 'none'
      zipPath         = $null
      fileName        = $null
      contentHash     = $manifest.contentHash
      fileCount       = 0
      sourceFileCount = $manifest.fileCount
      previousFileCount = $changeSummary.previousFileCount
      addedCount      = 0
      modifiedCount   = 0
      deletedCount    = 0
      sourceEmptied   = $false
      sourcePath      = $manifest.root
      backupDir       = [System.IO.Path]::GetFullPath($BackupDir)
      lastZip         = $state.lastZip
      lastFullZip     = $state.lastFullZip
      message         = 'Sin cambios respecto al ultimo backup; no se genera ZIP ni subida.'
    })
  exit 0
}

$resolvedMode = $Mode
if ($Mode -eq 'auto') {
  $needFull = $true
  if ($state.lastFullAt) {
    try {
      $lastFull = [datetime]::Parse($state.lastFullAt, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
      $needFull = ((Get-Date).ToUniversalTime() - $lastFull.ToUniversalTime()).TotalDays -ge $FullEveryDays
    } catch {
      $needFull = $true
    }
  }
  if (-not (Test-Path -LiteralPath $manifestLastFullPath)) { $needFull = $true }
  $resolvedMode = if ($needFull) { 'full' } else { 'differential' }
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$prefix = switch ($resolvedMode) {
  'full' { 'backup_full' }
  'differential' { 'backup_diff' }
  'incremental' { 'backup_incr' }
}
$zipPath = Join-Path $BackupDir "${prefix}_${stamp}.zip"

$filesToZip = @()
switch ($resolvedMode) {
  'full' {
    $filesToZip = @($manifest.files)
  }
  'differential' {
    $base = Read-JsonFile $manifestLastFullPath
    if ($null -eq $base) {
      Write-Host "No hay manifest de ultimo full; se fuerza FULL."
      $resolvedMode = 'full'
      $prefix = 'backup_full'
      $zipPath = Join-Path $BackupDir "${prefix}_${stamp}.zip"
      $filesToZip = @($manifest.files)
    } else {
      $filesToZip = @(Get-ChangedFiles -CurrentManifest $manifest -BaselineManifest $base)
    }
  }
  'incremental' {
    $base = Read-JsonFile $manifestLastBackupPath
    if ($null -eq $base) {
      $base = Read-JsonFile $manifestLastFullPath
    }
    if ($null -eq $base) {
      Write-Host "No hay baseline; se fuerza FULL."
      $resolvedMode = 'full'
      $prefix = 'backup_full'
      $zipPath = Join-Path $BackupDir "${prefix}_${stamp}.zip"
      $filesToZip = @($manifest.files)
    } else {
      $filesToZip = @(Get-ChangedFiles -CurrentManifest $manifest -BaselineManifest $base)
    }
  }
}

if ($resolvedMode -ne 'full' -and $filesToZip.Count -eq 0) {
  # Hash global cambió (p.ej. borrados) pero no hay ficheros nuevos/modificados que meter en diff/incr
  Write-Host "Cambios detectados sin ficheros a empaquetar (posible borrado). Se genera FULL."
  $resolvedMode = 'full'
  $prefix = 'backup_full'
  $zipPath = Join-Path $BackupDir "${prefix}_${stamp}.zip"
  $filesToZip = @($manifest.files)
}

Write-Host "Modo=$resolvedMode archivos=$($filesToZip.Count) -> $zipPath"
New-ZipFromRelativeFiles -Root $SourcePath -Files $filesToZip -ZipPath $zipPath

$nowUtc = (Get-Date).ToUniversalTime().ToString('o')
$state.lastContentHash = $manifest.contentHash
$state.lastMode = $resolvedMode
$state.lastZip = $zipPath
$state.lastBackupAt = $nowUtc
Write-JsonFile -Path $manifestLastBackupPath -Object $manifest

if ($resolvedMode -eq 'full') {
  $state.lastFullAt = $nowUtc
  $state.lastFullZip = $zipPath
  Write-JsonFile -Path $manifestLastFullPath -Object $manifest
}

Write-JsonFile -Path $statePath -Object $state

$reason = if ($changeSummary.sourceEmptied) { 'source_emptied' } elseif ($changeSummary.deletedCount -gt 0) { 'deletions' } else { 'ok' }
$maxList = 20
$deletedPreview = @($changeSummary.deletedPaths | Select-Object -First $maxList)
$addedPreview = @($changeSummary.addedPaths | Select-Object -First $maxList)

Emit-Result ([pscustomobject]@{
    status            = 'created'
    reason            = $reason
    mode              = $resolvedMode
    zipPath           = $zipPath
    fileName          = [System.IO.Path]::GetFileName($zipPath)
    contentHash       = $manifest.contentHash
    fileCount         = $filesToZip.Count
    sourceFileCount   = $manifest.fileCount
    previousFileCount = $changeSummary.previousFileCount
    addedCount        = $changeSummary.addedCount
    modifiedCount     = $changeSummary.modifiedCount
    deletedCount      = $changeSummary.deletedCount
    sourceEmptied     = [bool]$changeSummary.sourceEmptied
    deletedPaths      = $deletedPreview
    addedPaths        = $addedPreview
    sourcePath        = $manifest.root
    backupDir         = [System.IO.Path]::GetFullPath($BackupDir)
    lastZip           = $zipPath
    lastFullZip       = $state.lastFullZip
    message           = (Format-ChangeMessage -Summary $changeSummary -ResolvedMode $resolvedMode -ZipFileCount $filesToZip.Count)
  })
