$ErrorActionPreference = 'Stop'
$testKeyId = Read-Host 'Razorpay Test Key ID'
if ($testKeyId -notmatch '^rzp_test_[a-zA-Z0-9]+$') { throw 'Only Razorpay Test Mode keys are accepted.' }
$testSecret = Read-Host 'Razorpay Test Key Secret' -AsSecureString
$credential = [PSCredential]::new($testKeyId, $testSecret)
$folder = Join-Path $env:LOCALAPPDATA 'APSP\FurnitureStudio'
$targetFile = Join-Path $folder 'razorpay-test.xml'
try {
  $pair = $testKeyId + ':' + $credential.GetNetworkCredential().Password
  $auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
  $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://api.razorpay.com/v1/orders?count=1' -Headers @{Authorization=$auth} -TimeoutSec 20
  if ($response.StatusCode -ne 200) { throw 'Unexpected authentication response.' }
  Write-Output 'Razorpay test authentication verified.'
} catch {
  $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  if ($code -in 401,403) { throw "Razorpay rejected the credentials (HTTP $code). Existing settings were preserved." }
  if (Test-Path -LiteralPath $targetFile) { throw "Razorpay verification unavailable (HTTP $code). Your existing test keys are still in use. Retry when the provider is reachable." }
  Write-Output "Razorpay verification unavailable (HTTP $code). Saving initial test credentials for another attempt."
} finally { $auth=$null; $pair=$null; $response=$null }
[IO.Directory]::CreateDirectory($folder) | Out-Null
$pending = Join-Path $folder ([Guid]::NewGuid().ToString() + '.tmp')
try {
  $credential | Export-Clixml -LiteralPath $pending
  if ([IO.File]::Exists($targetFile)) {[IO.File]::Replace($pending,$targetFile,[System.Management.Automation.Language.NullString]::Value)}
  else {[IO.File]::Move($pending,$targetFile)}
} finally {
  $testSecret.Dispose()
  if ([IO.File]::Exists($pending)) {[IO.File]::Delete($pending)}
}
Write-Output 'Saved the test credentials with Windows current-user DPAPI protection.'
