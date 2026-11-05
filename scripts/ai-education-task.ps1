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
    if (-not $existing) {
        $action = New-ScheduledTaskAction -Execute $hostExecutable -Argument $arguments -WorkingDirectory $folder
        $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
        $logon = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
        $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($repeat,$logon) -Settings $settings -Principal $principal -Description 'Plunode AI education: finite local CPU polls; existing limits and common lock; no shared Kev changes.' | Out-Null
    }
    Start-ScheduledTask -TaskName $taskName
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
    Triggers=@($task.Triggers | ForEach-Object {if($_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger'){'Logon'}else{$_.Repetition.Interval}});
    MultipleInstances=[string]$task.Settings.MultipleInstances;WakeToRun=$task.Settings.WakeToRun;ExecutionTimeLimit=$task.Settings.ExecutionTimeLimit} | ConvertTo-Json -Compress
