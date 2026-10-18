# Windows worker identity preflight (M2, opt-in)

This is an **account separation smoke test**, not a Windows sandbox, not
an authorization system and not evidence that all files are inaccessible.
Run only on a trusted Windows machine. No user creation, privilege elevation,
ACL modification or credential collection is performed by the script.

## Operator preparation

1. Provision a dedicated **non-administrator** worker OS account through the
   normal Windows administration process. Do not reuse the operator identity.
2. Give that account write access to a scratch workspace that is *not* the
   operator's home directory, the main Git checkout or a credentials folder.
3. Using the **operator** account, create an existing canary file outside the
   scratch workspace. Configure its Windows ACL so the worker can inspect
   the **file attributes** but cannot read the file **data** (other users
   should not gain read-data access). Do not use customer secrets or live
   credentials as the canary. The worker must be able to distinguish this
   existing ordinary file from a missing path or a directory.
4. Record the operator's SID using PowerShell:

   `[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value`

## Run under the worker account

Open a separate PowerShell session **as that worker** and execute:

```powershell
powershell -NoProfile -File .\scripts\windows\check-worker-isolation.ps1 `
  -OperatorSid 'S-1-5-21-REPLACE-WITH-OPERATOR-SID' `
  -Workspace 'C:\path\to\dedicated-scratch' `
  -ProtectedCanary 'C:\path\to\operator-private\canary.txt'
```

Replace the placeholders with real operator-provided values. A **PASS** requires:
an OS SID different from the operator's; no administrator or shared service privileges;
an explicit access-denied result when opening the operator's existing canary;
and successful write/read/cleanup of a uniquely named file inside scratch.

The script fails closed when either account has the same SID, the worker token
is administrative or belongs to the Administrators group (even UAC-filtered),
the canary is readable, is a directory, is missing or reports
an error other than access denied, or scratch read/write fails. A missing file
is **not** evidence of denied access.

## Evidence and release limits

The normal Windows Bun suite includes negative controls proving that a
same-account execution, readable canary and missing canary cannot pass. These
negative controls **do not** establish a successful two-account run.

Capture the worker's exit code and output with the actual OS identity, the
canary ACL owner, a test workspace location, and the Git SHA. Next run an
actual OpenCode task under the separate identity with a non-sensitive fixture,
confirm its subprocess token and filesystem boundary, and independently
review that result. Until both stages pass, M2 isolation is **not verified**
and no production deployment may rely on this preflight.
