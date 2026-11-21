$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
 Push-Location ui
 try {
  npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) {throw 'npm install failed'}
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {throw 'React build failed'}
 } finally { Pop-Location }
 $maven = Get-Command mvn.cmd -ErrorAction SilentlyContinue
 if ($maven) { $mvnPath = $maven.Source } else {
  $mvnPath = Get-ChildItem "$env:USERPROFILE\.m2\wrapper\dists" -Filter mvn.cmd -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
 }
 if (!$mvnPath) {throw 'Install Maven 3.9+ or use the packaged JAR with Start.ps1'}
 & $mvnPath -q package
 if ($LASTEXITCODE -ne 0) {throw 'Spring Boot build failed'}
} finally { Pop-Location }