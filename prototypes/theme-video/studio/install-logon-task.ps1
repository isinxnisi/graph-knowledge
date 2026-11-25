# Install for the current interactive Windows user and start the studio now.
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-VideoStudio'
$description = 'Start the local Plunode video studio at Windows sign-in.'
$existing = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $description) { throw "Task name already in use: $taskName" }
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$python = (& python -c 'import sys; print(sys.executable)').Trim()
if ($LASTEXITCODE -ne 0 -or -not $python) { throw 'Windows Python is required.' }
$pythonw = Join-Path (Split-Path -Parent $python) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $pythonw -PathType Leaf)) { throw "Missing windowless Python: $pythonw" }
$launcher = (Get-Item -LiteralPath (Join-Path $PSScriptRoot 'start.py')).FullName

# Keep the working directory on Windows. If WSL is still starting at sign-in,
# the local executable can return an error and the scheduler can try again.
$action = New-ScheduledTaskAction -Execute $pythonw -Argument ('-B "' + $launcher + '"') -WorkingDirectory $env:USERPROFILE
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskPath '\' -TaskName $taskName -Description $description `
    -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskPath '\' -TaskName $taskName
