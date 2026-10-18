param(
    [ValidateSet('Install', 'Run', 'Status', 'Remove')][string]$Mode = 'Status',
    [string]$Config = '/home/isinxnisi/.local/share/plunode-collection-worker/config.json',
    [ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distribution = 'Ubuntu'
)
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-CollectionWorker'
# Packaged desktop hosts can virtualize LocalAppData; Task Scheduler cannot see that
# private view. Keep the launcher in the user's ordinary, non-virtualized home instead.
$taskFolder = Join-Path $env:USERPROFILE 'plunode-collection-worker'
if ($Config -notmatch '^/home/[A-Za-z0-9._/-]+/config\.json$' -or $Config.Contains('..')) {
    throw 'Expected an absolute WSL home config.json path'
}
if ($Mode -eq 'Run') {
    $runtime = $Config.Substring(0, $Config.LastIndexOf('/')) + '/runtime/scripts/collection-worker.py'
    # No shell interpolation in WSL. Credentials are noninteractive inside the Worker.
    & wsl.exe -d $Distribution --exec /usr/bin/python3 $runtime once --config $Config *> (Join-Path $taskFolder 'last-run.log')
    exit $LASTEXITCODE
}
if ($Mode -eq 'Install') {
    $sourceLauncher = Join-Path $PSScriptRoot 'collection-worker-launcher.wsf'
    if (-not (Test-Path -LiteralPath $sourceLauncher -PathType Leaf)) { throw 'Missing GUI launcher source' }
    New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
    $runner = Join-Path $taskFolder 'worker.ps1'
    $launcher = Join-Path $taskFolder 'worker.wsf'
    Copy-Item -LiteralPath $PSCommandPath -Destination $runner -Force
    Copy-Item -LiteralPath $sourceLauncher -Destination $launcher -Force
    # A GUI executable is the task entry point: PowerShell may allocate/show its console
    # before -WindowStyle Hidden is processed. The launcher hides the child at creation
    # and waits for its exit, preserving IgnoreNew, duration and the actual exit code.
    $arguments = '//B //NoLogo "' + $launcher + '" "' + $runner + '" "' + $Config + '" "' + $Distribution + '"'
    $hostExecutable = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $action = New-ScheduledTaskAction -Execute $hostExecutable -Argument $arguments -WorkingDirectory $taskFolder
    $existing = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
        # Keep trigger anchors, IgnoreNew, enabled state, principal and all limits exactly.
        Set-ScheduledTask -TaskPath '\' -TaskName $taskName -Action $action | Out-Null
    } else {
        $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
        $logon = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
        $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskPath '\' -TaskName $taskName -Action $action -Trigger @($repeat, $logon) -Settings $settings -Principal $principal -Description 'Plunode GitHub approvals: collection/review and acceptance/release plan only; never public apply.' -Force | Out-Null
        Start-ScheduledTask -TaskPath '\' -TaskName $taskName
    }
}
if ($Mode -eq 'Remove') {
    # Do not terminate an active workflow or delete its resumable state.
    Disable-ScheduledTask -TaskName $taskName | Out-Null
    Write-Output 'New checks disabled. An active workflow may finish; WSL state and approvals retained.'
} else {
    $task = Get-ScheduledTask -TaskName $taskName
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    [pscustomobject]@{TaskName=$task.TaskName; State=[string]$task.State; LastRunTime=$info.LastRunTime;
        LastTaskResult=$info.LastTaskResult; NextRunTime=$info.NextRunTime} | ConvertTo-Json -Compress
}
