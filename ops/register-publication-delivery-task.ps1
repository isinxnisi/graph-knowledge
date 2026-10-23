# Registration is a separate operator-approved activation operation. Never enables the task.
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
    [switch]$UpdateExisting
)
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-Publication-Delivery'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and -not $UpdateExisting) { throw 'Existing task preserved; use reviewed -UpdateExisting for action-only update.' }
if ($UpdateExisting -and -not $existing) { throw 'Existing publication task required.' }
if ($existing -and [string]$existing.State -eq 'Running') { throw 'Running delivery preserved; wait for a safe boundary.' }
$taskFolder = Join-Path $env:USERPROFILE 'plunode-publication-delivery'
$launcher = Join-Path $taskFolder 'delivery.wsf'
$launcherSource = Join-Path $PSScriptRoot 'publication-delivery-launcher.wsf'
if (-not (Test-Path -LiteralPath $launcherSource -PathType Leaf)) { throw 'Missing fixed GUI launcher.' }
$wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
$hostExecutable = Join-Path $env:SystemRoot 'System32\wscript.exe'
$arguments = '//B //NoLogo "' + $launcher + '" ' + $SourceCommit
if ($existing) {
    # Accept only this task's fixed direct or GUI action, never an unrelated command.
    $old = @($existing.Actions)
    $direct = '^-d Ubuntu -u isinxnisi -- /usr/bin/python3 -B /usr/local/lib/plunode-receipts/[a-f0-9]{40}/scripts/publication-delivery\.py --config /etc/plunode-publication/delivery\.json --queue$'
    $hidden = '^//B //NoLogo "' + [regex]::Escape($launcher) + '" [a-f0-9]{40}$'
    if ($old.Count -ne 1 -or -not (($old[0].Execute -eq $wsl -and $old[0].Arguments -match $direct) -or
        ($old[0].Execute -eq $hostExecutable -and $old[0].Arguments -match $hidden))) { throw 'Existing publication action differs; inspect without changing it.' }
    $beforeXml = Export-ScheduledTask -TaskName $taskName
    $before = [xml]$beforeXml
}
New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
Copy-Item -LiteralPath $launcherSource -Destination $launcher -Force
$action = New-ScheduledTaskAction -Execute $hostExecutable -Argument $arguments -WorkingDirectory $taskFolder
if ($existing) {
    if ([string](Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { throw 'Delivery started; preserve it and retry at a safe boundary.' }
    $backup = Join-Path $taskFolder ('task-before-' + [guid]::NewGuid().ToString('N') + '.xml')
    [IO.File]::WriteAllText($backup, $beforeXml)
    Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
    $after = [xml](Export-ScheduledTask -TaskName $taskName)
    foreach ($node in @('Settings','Principals','Triggers')) {
        if ($before.Task.$node.OuterXml -ne $after.Task.$node.OuterXml) { throw ('Unexpected task change; inspect preserved XML: ' + $node) }
    }
    @{phase='delivery-task-action-updated';task=$taskName;sourceCommit=$SourceCommit;
      enabled=(Get-ScheduledTask -TaskName $taskName).Settings.Enabled;backup=$backup} | ConvertTo-Json -Compress
} else {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $identity), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)))
    $settings = New-ScheduledTaskSettingsSet -Disable -Hidden -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $definition = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Resume already signed publications only; no Codex, signing key or acceptance execution.'
    Register-ScheduledTask -TaskName $taskName -InputObject $definition | Out-Null
    if ((Get-ScheduledTask -TaskName $taskName).Settings.Enabled) { throw 'Unexpected enabled task; inspect immediately.' }
    @{phase='delivery-task-registered-disabled';task=$taskName;sourceCommit=$SourceCommit;enabled=$false;periodicMinutes=5;runLevel='Limited';productionApplyCalls=0} | ConvertTo-Json -Compress
}
