param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$studioPort = if ($env:APSP_PORT) {[int]$env:APSP_PORT} else {8174}
$studioAddress = if ($env:APSP_HOST -and $env:APSP_HOST -notin @('0.0.0.0','::')) {$env:APSP_HOST} else {'127.0.0.1'}
$studioUrl = ([UriBuilder]::new('http',$studioAddress,$studioPort)).Uri.AbsoluteUri
function Test-StudioReady([string]$address) {
  try {
    $page = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 2 -ErrorAction Stop
    return $page.StatusCode -eq 200 -and $page.Content.Contains('<title>APSP Furniture Studio</title>')
  } catch {return $false}
}
# Coordinate repeated clicks while the JVM is still starting and has not bound the port.
$launchGate = [Threading.Mutex]::new($false, "Local\APSPFurnitureStudio-$studioPort")
$ownsGate = $false
try {
  $waiting = $false
  $deadline = [DateTime]::UtcNow.AddMinutes(3)
  while (!$ownsGate) {
    if (Test-StudioReady $studioUrl) {
      Write-Host "APSP Furniture Studio is already running at $studioUrl"
      if ($OpenBrowser) {Start-Process -FilePath $studioUrl}
      return
    }
    try {$ownsGate = $launchGate.WaitOne(300)}
    catch [Threading.AbandonedMutexException] {$ownsGate = $true}
    if (!$ownsGate -and !$waiting) {
      Write-Host "Another window is starting the shop. Waiting for $studioUrl"
      $waiting = $true
    }
    if (!$ownsGate -and [DateTime]::UtcNow -gt $deadline) {throw "Check the first startup window for progress at $studioUrl"}
  }
  if (!(Test-Path 'target\furniture-suite-1.0.0.jar')) { & .\Build.ps1 }
  $credentialFile = Join-Path $env:LOCALAPPDATA 'APSP\FurnitureStudio\razorpay-test.xml'
  $loadStored = !$env:RAZORPAY_TEST_KEY_ID -and !$env:RAZORPAY_TEST_KEY_SECRET -and (Test-Path -LiteralPath $credentialFile)
  $mailFile = Join-Path $env:LOCALAPPDATA 'APSP\FurnitureStudio\gmail.xml'
  $loadMail = !$env:APSP_GMAIL_APP_PASSWORD -and (Test-Path -LiteralPath $mailFile) -and (!$env:APSP_SMTP_HOST -or $env:APSP_SMTP_HOST -eq 'smtp.gmail.com')
  $browserJob = $null
  if ($OpenBrowser) {
    $browserJob = Start-Job -ArgumentList $studioUrl -ScriptBlock {
      param($address)
      $until = [DateTime]::UtcNow.AddMinutes(3)
      while ([DateTime]::UtcNow -lt $until) {
        try {
          $page = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 2 -ErrorAction Stop
          if ($page.StatusCode -eq 200 -and $page.Content.Contains('<title>APSP Furniture Studio</title>')) {
            Start-Process -FilePath $address
            return
          }
        } catch {}
        Start-Sleep -Milliseconds 750
      }
    }
  }
  Write-Host "Starting APSP Furniture Studio at $studioUrl"
  Write-Host 'Keep this window open while using the shop. Press Ctrl+C here to stop it.'
  try {
    if ($loadMail) {
      $mail = Import-Clixml -LiteralPath $mailFile
      if ($mail.UserName -ne 'apratap5449@gmail.com') {throw 'Unexpected saved Gmail account'}
      $env:APSP_GMAIL_APP_PASSWORD = $mail.GetNetworkCredential().Password -replace '\s',''
    }
    if ($loadStored) {
      $credential = Import-Clixml -LiteralPath $credentialFile
      if ($credential.UserName -notmatch '^rzp_test_[a-zA-Z0-9]+$') {throw 'Invalid saved test credential'}
      $env:RAZORPAY_TEST_KEY_ID = $credential.UserName
      $env:RAZORPAY_TEST_KEY_SECRET = $credential.GetNetworkCredential().Password
    }
    java -jar target/furniture-suite-1.0.0.jar
    if ($LASTEXITCODE -ne 0) {throw "Studio exited with code $LASTEXITCODE"}
  } finally {
    if ($null -ne $browserJob) {Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue}
    if ($loadMail) {Remove-Item Env:APSP_GMAIL_APP_PASSWORD -ErrorAction SilentlyContinue}
    if ($loadStored) { Remove-Item Env:RAZORPAY_TEST_KEY_ID,Env:RAZORPAY_TEST_KEY_SECRET -ErrorAction SilentlyContinue }
  }
} finally {
  if ($ownsGate) {$launchGate.ReleaseMutex()}
  $launchGate.Dispose()
}
