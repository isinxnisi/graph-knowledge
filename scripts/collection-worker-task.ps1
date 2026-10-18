param(
    [ValidateSet('Install', 'Run', 'Status', 'Remove')][string]$Mode = 'Status',
    [string]$Config = '/home/isinxnisi/.local/share/plunode-collection-worker/config.json',
    [ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distribution = 'Ubuntu'
)
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-CollectionWorker'
$taskFolder = Join-Path $env:LOCALAPPDATA 'PlunodeCollectionWorker'
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
    New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
    $runner = Join-Path $taskFolder 'worker.ps1'
    Copy-Item -LiteralPath $PSCommandPath -Destination $runner -Force
    $arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runner + '" -Mode Run -Config "' + $Config + '" -Distribution "' + $Distribution + '"'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $logon = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($repeat, $logon) -Settings $settings -Principal $principal -Description 'Plunode GitHub approvals: collection/review and acceptance/release plan only; never public apply.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
}
if ($Mode -eq 'Remove') {
    # Do not terminate an active workflow or delete its resumable state.
    Disable-ScheduledTask -TaskName $taskName | Out-Null
    Write-Output 'New checks disabled. An active workflow may finish; WSL state and approvals retained.'
} else {
    Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
    Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime, LastTaskResult, NextRunTime
}
