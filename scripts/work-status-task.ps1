param(
    [ValidateSet('Install','Run','Status','Observe')][string]$Mode = 'Status',
    [string]$Distribution = 'Ubuntu',
    [string]$ScriptPath,
    [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-WorkStatus'
$folder = Join-Path $env:USERPROFILE 'plunode-work-status'
function Observe-Windows {
    $tasks = @(Get-ScheduledTask | Where-Object { $_.TaskName -in @('Plunode-CollectionWorker','Plunode-Publication-Delivery','GraphKnowledge-Autopilot','Afterglow-LoginRecovery','Plunode-WorkStatus') } | ForEach-Object {
        $task = $_; $info = $task | Get-ScheduledTaskInfo
        $last = $null; $next = $null
        if ($info.LastRunTime -and $info.LastRunTime.Year -gt 2000) { $last = $info.LastRunTime.ToString('o') }
        if ($info.NextRunTime -and $info.NextRunTime.Year -gt 2000) { $next = $info.NextRunTime.ToString('o') }
        [pscustomobject]@{name=$task.TaskName;taskState=[string]$task.State;enabled=($task.State -ne 'Disabled');last=$last;next=$next;lastResult=$info.LastTaskResult;
            resultClass=$(if($info.LastTaskResult -in @(0,267009)){'normal-poll-or-running'}else{'failure:'+ $info.LastTaskResult});
            schedule=@($task.Triggers | ForEach-Object { if($_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger'){'Logon'}elseif($_.Repetition.Interval){$_.Repetition.Interval}else{'Configured'} })}
    })
    [pscustomobject]@{observedAt=(Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz');tasks=$tasks;cloudflaredCount=@(Get-Process -Name cloudflared -ErrorAction SilentlyContinue).Count}
}
if ($Mode -eq 'Observe') {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $folder 'windows.json'), ((Observe-Windows) | ConvertTo-Json -Depth 7), (New-Object Text.UTF8Encoding($false)))
    Write-Output 'Windows observation saved; no task or Worker action.'
    exit 0
}
if ($Mode -eq 'Run') {
    $settings = Get-Content -LiteralPath (Join-Path $folder 'runner.json') -Raw | ConvertFrom-Json
    $snapshot = Join-Path $folder 'windows.json'; $temporary = $snapshot + '.tmp'
    [IO.File]::WriteAllText($temporary, ((Observe-Windows) | ConvertTo-Json -Depth 7), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $snapshot -Force
    & wsl.exe -d $settings.distribution --exec /usr/bin/python3 -B $settings.script --config $settings.config --publish *> (Join-Path $folder 'last-run.log')
    exit $LASTEXITCODE
}
if ($Mode -eq 'Install') {
    if ($Distribution -notmatch '^[A-Za-z0-9._-]+$' -or $ScriptPath -notmatch '^/home/[A-Za-z0-9._/-]+/work-status\.py$' -or $ConfigPath -notmatch '^/home/[A-Za-z0-9._/-]+/config\.json$' -or $ScriptPath.Contains('..') -or $ConfigPath.Contains('..')) { throw 'Expected explicit WSL script/config paths' }
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect it rather than overwrite' }
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $folder 'runner.ps1')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'work-status-launcher.wsf') -Destination (Join-Path $folder 'launcher.wsf')
    [IO.File]::WriteAllText((Join-Path $folder 'runner.json'), (@{distribution=$Distribution;script=$ScriptPath;config=$ConfigPath} | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    $action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('//B //NoLogo "'+(Join-Path $folder 'launcher.wsf')+'"') -WorkingDirectory $folder
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 30)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Read-only Plunode work status; ordinary Python, no AI, no Worker/service actions.' | Out-Null
}
$t=Get-ScheduledTask -TaskName $taskName; $i=$t | Get-ScheduledTaskInfo
[pscustomobject]@{name=$t.TaskName;state=[string]$t.State;last=$i.LastRunTime;next=$i.NextRunTime;result=$i.LastTaskResult} | ConvertTo-Json -Compress
