param(
    [ValidateSet('Install', 'Status', 'Run')][string]$Mode = 'Status',
    [ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distribution = 'Ubuntu',
    [string]$Repository = '/home/isinxnisi/1.projects/7.graph-knowledge'
)
$ErrorActionPreference = 'Stop'
$name = 'Plunode-DevBuildCache'
$owner = 'Plunode: weekly cleanup of inactive local Next.js compiler caches.'
$folder = Join-Path $env:LOCALAPPDATA 'Plunode\dev-storage'
$configFile = Join-Path $folder 'location.json'
if ($Mode -eq 'Run') {
    $config = Get-Content -Raw -LiteralPath $configFile | ConvertFrom-Json
    # Keep a single bounded run log, including the non-blocking lock result.
    $wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
    & $wsl --distribution $config.distribution --cd $config.repository --exec /usr/bin/python3 -B scripts/dev_build_cache.py --apply *> (Join-Path $folder 'last-run.log')
    exit $LASTEXITCODE
}

$current = Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction SilentlyContinue
if ($Mode -eq 'Install') {
    if ($current -and ($current.Description -ne $owner -or $current.State -eq 'Running')) {
        throw 'The existing task is owned by another installation or is currently running.'
    }
    if ($Repository -notmatch '^/home/[A-Za-z0-9_./-]+$' -or $Repository.Split('/') -contains '..') {
        throw 'Expected an absolute WSL project directory.'
    }
    & wsl.exe -d $Distribution --cd $Repository --exec /usr/bin/test -f scripts/dev_build_cache.py
    if ($LASTEXITCODE -ne 0) { throw 'The cache maintenance script could not be found.' }

    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $folder 'runner.ps1') -Force
    # This existing GUI launcher runs its neighbouring runner.ps1 -Mode Run.
    $launcher = Join-Path $folder 'launcher.wsf'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'work-status-launcher.wsf') -Destination $launcher -Force
    @{distribution=$Distribution; repository=$Repository} | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
    $action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "' + $launcher + '"') -WorkingDirectory $folder
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '13:15'
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    if ($current) {
        $settings.Enabled = $current.Settings.Enabled
        Set-ScheduledTask -TaskPath '\' -TaskName $name -Action $action -Trigger $trigger -Settings $settings | Out-Null
    } else {
        Register-ScheduledTask -TaskPath '\' -TaskName $name -Description $owner -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    }
    $current = Get-ScheduledTask -TaskPath '\' -TaskName $name
}
if ($current) {
    Get-ScheduledTaskInfo -TaskPath '\' -TaskName $name | Select-Object TaskName,LastRunTime,LastTaskResult,NextRunTime
} else {
    Write-Output 'Cache maintenance task has not been installed.'
}
