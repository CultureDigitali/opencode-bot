$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
$runnerPath = & (Join-Path $PSScriptRoot "windows/build-runner.ps1")
if (-not $runnerPath -or -not (Test-Path -LiteralPath $runnerPath)) { throw "Windows runner build failed" }
$buildDir = [System.IO.Path]::GetDirectoryName($runnerPath)
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$parent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetDirectoryName($buildDir) + [System.IO.Path]::DirectorySeparatorChar)
if ($parent -ne $tempRoot -or
    -not ([System.IO.Path]::GetFileName($buildDir) -match '^ocb-job-runner-[0-9a-f]{32}$')) {
  throw "Refusing to clean up unrecognized Windows runner build path"
}
$priorRunner = $env:OPENCODE_BOT_WINDOWS_JOB_RUNNER
$priorDigest = $env:OPENCODE_BOT_WINDOWS_JOB_RUNNER_SHA256
$env:OPENCODE_BOT_WINDOWS_JOB_RUNNER = $runnerPath
$env:OPENCODE_BOT_WINDOWS_JOB_RUNNER_SHA256 = (Get-FileHash -LiteralPath $runnerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$commands = @(
  @("install", "--frozen-lockfile"),
  @("test"),
  @("run", "typecheck"),
  @("run", "build")
)
try {
  foreach ($parts in $commands) {
    Write-Host ("[local-ci] bun " + ($parts -join " "))
    & bun @parts
    if ($LASTEXITCODE -ne 0) {
      throw ("Local CI check failed: bun " + ($parts -join " "))
    }
  }
  Write-Host ("[local-ci] PASS at " + (& git rev-parse HEAD))
} finally {
  $env:OPENCODE_BOT_WINDOWS_JOB_RUNNER = $priorRunner
  $env:OPENCODE_BOT_WINDOWS_JOB_RUNNER_SHA256 = $priorDigest
  if (Test-Path -LiteralPath $buildDir) {
    # Scope verified above: only this run's OS temp GUID build folder.
    [System.IO.Directory]::Delete($buildDir, $true)
  }
}
