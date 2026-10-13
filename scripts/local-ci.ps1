$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
$runnerPath = & (Join-Path $PSScriptRoot "windows/build-runner.ps1")
if (-not $runnerPath -or -not (Test-Path -LiteralPath $runnerPath)) { throw "Windows runner build failed" }
$env:OPENCODE_BOT_WINDOWS_JOB_RUNNER = $runnerPath
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
