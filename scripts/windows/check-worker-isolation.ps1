# Run inside a dedicated non-administrator worker account. This is a
# fail-closed preflight, not an OS-account provisioning mechanism.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OperatorSid,
  [Parameter(Mandatory = $true)][string]$Workspace,
  [Parameter(Mandatory = $true)][string]$ProtectedCanary
)

$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Windows only" }
if ($OperatorSid -notmatch '^S-1-[0-9-]+$') { throw "Invalid operator SID" }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$workerSid = $identity.User.Value
if ($workerSid -eq $OperatorSid) {
  throw "Isolation FAIL: worker has the same OS identity as the operator"
}
# A directory opened as a file can ALSO produce UnauthorizedAccessException.
# Require observable regular-file metadata before counting a read denial.
# The canary ACL must allow metadata inspection but deny reading file data.
$canaryPath = [System.IO.Path]::GetFullPath($ProtectedCanary)
try {
  $canaryAttributes = [System.IO.File]::GetAttributes($canaryPath)
} catch {
  throw "Isolation FAIL: cannot prove the operator canary is an existing file"
}
if (($canaryAttributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
  throw "Isolation FAIL: the operator canary is a directory, not a file"
}
# Missing files are not an access-denied result; accept only explicit denial.
$accessDenied = $false
try {
  $handle = [System.IO.File]::OpenRead($canaryPath)
  $handle.Dispose()
} catch [System.UnauthorizedAccessException] {
  $accessDenied = $true
}
if (-not $accessDenied) {
  throw "Isolation FAIL: the operator canary was readable"
}
$principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
$adminMembership = @($identity.Groups | ForEach-Object { $_.Value }) -contains "S-1-5-32-544"
if ($principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator) -or
    $adminMembership -or
    $workerSid -in @("S-1-5-18", "S-1-5-19", "S-1-5-20")) {
  throw "Isolation FAIL: worker has administrator membership or shared service privileges"
}

$workspaceFull = [System.IO.Path]::GetFullPath($Workspace)
if (-not [System.IO.Directory]::Exists($workspaceFull)) {
  throw "Isolation FAIL: worker workspace is missing"
}
$probe = Join-Path $workspaceFull ("ocb-worker-probe-" + [Guid]::NewGuid().ToString("N") + ".txt")
try {
  [System.IO.File]::WriteAllText($probe, $workerSid)
  if ([System.IO.File]::ReadAllText($probe) -ne $workerSid) {
    throw "Isolation FAIL: scratch workspace is not writable"
  }
} finally {
  if ([System.IO.File]::Exists($probe)) { [System.IO.File]::Delete($probe) }
}
Write-Output ("ISOLATION_PREFLIGHT_PASS workerSid=" + $workerSid)
