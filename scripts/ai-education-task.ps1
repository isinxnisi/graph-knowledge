param(
    [ValidateSet('Install','Run','Status','Enable','Disable')][string]$Mode = 'Status',
    [ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distribution = 'Ubuntu',
    [string]$ScriptPath = '/home/isinxnisi/1.projects/7.graph-knowledge/experiments/ai-lab/autonomy.py',
    [string]$WorkerHome = '/home/isinxnisi/.local/share/plunode-ai-lab/autonomous-v1'
)
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-AI-Education'
# Use the ordinary Windows home; packaged-app LocalAppData can be virtualized.
$folder = Join-Path $env:USERPROFILE 'plunode-ai-education'
$launcher = Join-Path $folder 'launcher.wsf'
$runner = Join-Path $folder 'runner.ps1'
$hostExecutable = Join-Path $env:SystemRoot 'System32\wscript.exe'
$arguments = '//B //NoLogo "' + $launcher + '"'
if ($Mode -eq 'Run') {
    $config = Get-Content -LiteralPath (Join-Path $folder 'runner.json') -Raw | ConvertFrom-Json
    $repository = $config.script.Substring(0, $config.script.Length - '/experiments/ai-lab/autonomy.py'.Length)
    # Foreground, finite invocation: wsl.exe stays alive for the complete guarded job.
    # No shell, daemon PID dependency, credential export, model or budget overrides.
    & wsl.exe -d $config.distribution --cd $repository --exec /usr/bin/python3 -B $config.script --home $config.home scheduled-tick *> (Join-Path $folder 'last-run.log')
    exit $LASTEXITCODE
}
$existing = Get-ScheduledTask -TaskPath '\' -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Actions.Count -ne 1 -or $existing.Actions[0].Execute -ne $hostExecutable -or $existing.Actions[0].Arguments -ne $arguments -or $existing.Description -ne 'Plunode AI education: finite local CPU polls; existing limits and common lock; no shared Kev changes.') {
        throw 'Existing task ownership differs; refusing to overwrite it'
    }
}
if ($Mode -eq 'Install') {
    if ($ScriptPath -notmatch '^/home/[A-Za-z0-9._/-]+/experiments/ai-lab/autonomy\.py$' -or $WorkerHome -notmatch '^/home/[A-Za-z0-9._/-]+$' -or $ScriptPath.Contains('..') -or $WorkerHome.Contains('..')) { throw 'Expected absolute WSL script/home paths' }
    if ($existing -and $existing.State -eq 'Running') { throw 'Wait for the current finite invocation before updating launcher files' }
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    Copy-Item -LiteralPath $PSCommandPath -Destination $runner -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ai-education-launcher.wsf') -Destination $launcher -Force
    [IO.File]::WriteAllText((Join-Path $folder 'runner.json'),(@{distribution=$Distribution;script=$ScriptPath;home=$WorkerHome}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
    # Daily JST morning window, not a 24-hour minute poll. Python still owns all
    # admission decisions, budgets and locks; an overlapping invocation is skipped.
    $jstDate = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Tokyo Standard Time').ToString('yyyy-MM-dd')
    $morning = New-ScheduledTaskTrigger -Daily -At '05:00'
    $morning.StartBoundary = $jstDate + 'T05:00:00+09:00'
    $morning.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 3)).Repetition
    $morning.Repetition.StopAtDurationEnd = $false
    # Receive the 08:30 cloud review; 09:00 is a bounded fallback for the existing
    # hourly maintenance throttle or a busy common lock. Neither starts education.
    $review = New-ScheduledTaskTrigger -Daily -At '08:35'
    $review.StartBoundary = $jstDate + 'T08:35:00+09:00'
    $fallback = New-ScheduledTaskTrigger -Daily -At '09:00'
    $fallback.StartBoundary = $jstDate + 'T09:00:00+09:00'
    $logon = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
    $triggers = @($morning,$review,$fallback,$logon)
    if (-not $existing) {
        $action = New-ScheduledTaskAction -Execute $hostExecutable -Argument $arguments -WorkingDirectory $folder
        $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Plunode AI education: finite local CPU polls; existing limits and common lock; no shared Kev changes.' | Out-Null
    } else {
        # Update only our verified task's triggers, preserving its settings and
        # enabled/disabled state. Reinstall must also replace the old minute poll.
        Set-ScheduledTask -TaskPath '\' -TaskName $taskName -Trigger $triggers | Out-Null
    }
    if (-not $existing -or $existing.State -ne 'Disabled') {
        Start-ScheduledTask -TaskName $taskName
    }
} elseif ($Mode -eq 'Enable') {
    if (-not $existing) { throw 'Install the task first' }
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
} elseif ($Mode -eq 'Disable') {
    if (-not $existing) { throw 'Task is not installed' }
    # Disable future launches; do not kill a guarded model operation.
    Disable-ScheduledTask -TaskName $taskName | Out-Null
}
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
[pscustomobject]@{TaskName=$task.TaskName;State=[string]$task.State;LastRunTime=$info.LastRunTime;LastTaskResult=$info.LastTaskResult;NextRunTime=$info.NextRunTime;
    Triggers=@($task.Triggers | ForEach-Object {[pscustomobject]@{Type=$_.CimClass.CimClassName;Start=$_.StartBoundary;Interval=$_.Repetition.Interval;Duration=$_.Repetition.Duration}});
    MultipleInstances=[string]$task.Settings.MultipleInstances;WakeToRun=$task.Settings.WakeToRun;ExecutionTimeLimit=$task.Settings.ExecutionTimeLimit} | ConvertTo-Json -Compress
