param([string]$Runner, [string]$ResultPath, [string]$ProbePath)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'HandleInheritanceProbe.cs'
Add-Type -Path $source -OutputAssembly $ProbePath -OutputType ConsoleApplication -ErrorAction Stop
& $ProbePath launch $Runner $ResultPath
if ($LASTEXITCODE -ne 0) { throw "Inheritance probe failed with exit code $LASTEXITCODE" }
