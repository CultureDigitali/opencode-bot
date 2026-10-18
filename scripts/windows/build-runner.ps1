$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Windows only" }
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$source = Join-Path $PSScriptRoot "JobRunner.cs"
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.Substring(0, 16).ToLowerInvariant()
# Avoid both stale cache reuse and unbounded native executables in the repo.
# Callers own cleanup of this uniquely created temporary build directory.
$buildDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("ocb-job-runner-" + [Guid]::NewGuid().ToString("N"))
if (Test-Path -LiteralPath $buildDirectory) { throw "Runner build directory already exists" }
[void][System.IO.Directory]::CreateDirectory($buildDirectory)
$target = Join-Path $buildDirectory ("JobRunner-" + $hash + ".exe")
try {
  Add-Type -Path $source -OutputAssembly $target -OutputType ConsoleApplication -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Windows runner compilation produced no executable" }
  Write-Output $target
} catch {
  # Delete only the fresh GUID directory we created in this invocation.
  [System.IO.Directory]::Delete($buildDirectory, $true)
  throw
}
