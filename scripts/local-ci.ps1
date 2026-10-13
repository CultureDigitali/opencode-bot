$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
$commands = @(
  @("install", "--frozen-lockfile"),
  @("test"),
  @("run", "typecheck"),
  @("run", "build")
)
foreach ($parts in $commands) {
  Write-Host ("[local-ci] bun " + ($parts -join " "))
  & bun @parts
  if ($LASTEXITCODE -ne 0) {
    throw ("Local CI check failed: bun " + ($parts -join " "))
  }
}
Write-Host ("[local-ci] PASS at " + (& git rev-parse HEAD))
