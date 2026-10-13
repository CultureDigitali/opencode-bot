$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Windows only" }
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$source = Join-Path $PSScriptRoot "JobRunner.cs"
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.Substring(0, 16).ToLowerInvariant()
$target = Join-Path $repo ("dist\ocb-job-runner-" + $hash + ".exe")
if (-not (Test-Path -LiteralPath $target)) {
    Add-Type -Path $source -OutputAssembly $target -OutputType ConsoleApplication -ErrorAction Stop
}
Write-Output $target
