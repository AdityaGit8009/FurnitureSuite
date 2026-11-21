param([switch]$SaveOnly)
$ErrorActionPreference = 'Stop'
if (!$SaveOnly -and (Get-NetTCPConnection -State Listen -LocalPort 8174 -ErrorAction SilentlyContinue)) {
  throw 'The studio is running. Use -SaveOnly to save your Gmail credential, then restart the studio.'
}
$shopAccount = 'apratap5449@gmail.com'
$secret = Read-Host "Gmail App Password for $shopAccount" -AsSecureString
try {
  $credential = [PSCredential]::new($shopAccount, $secret)
  if (($credential.GetNetworkCredential().Password -replace '\s', '').Length -ne 16) {throw 'Enter the 16-character Google App Password.'}
  $folder = Join-Path $env:LOCALAPPDATA 'APSP\FurnitureStudio'
  [IO.Directory]::CreateDirectory($folder) | Out-Null
  $targetFile = Join-Path $folder 'gmail.xml'
  $pending = Join-Path $folder ([Guid]::NewGuid().ToString() + '.tmp')
  try {
    $credential | Export-Clixml -LiteralPath $pending
    if ([IO.File]::Exists($targetFile)) {[IO.File]::Replace($pending,$targetFile,[System.Management.Automation.Language.NullString]::Value)}
    else {[IO.File]::Move($pending,$targetFile)}
  } finally {if ([IO.File]::Exists($pending)) {[IO.File]::Delete($pending)}}
  Write-Output 'Gmail credential saved with Windows current-user encryption.'
} finally {$secret.Dispose()}
if (!$SaveOnly) {& "$PSScriptRoot\Start.ps1"}