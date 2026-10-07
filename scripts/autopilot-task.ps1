param(
    [ValidateSet('status','on','off','run','apply')][string]$Action,
    [string]$ResultPath,
    [int]$EveryHours = 2,
    [int]$MaxRunMinutes = 45,
    [switch]$Elevated
)
$ErrorActionPreference = 'Stop'
$taskName = 'GraphKnowledge-Autopilot'
$utf8 = New-Object Text.UTF8Encoding($false)
function Save-Result($data) {
    [IO.File]::WriteAllText($ResultPath, ($data | ConvertTo-Json -Depth 5), $utf8)
}
try {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if ($Action -ne 'status' -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        if ($Elevated) { throw 'Administrator permission was not granted.' }
        $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Action {1} -ResultPath "{2}" -EveryHours {3} -MaxRunMinutes {4} -Elevated' -f $PSCommandPath,$Action,$ResultPath,$EveryHours,$MaxRunMinutes
        $child = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
        exit $child.ExitCode
    }
    $message = ''
    switch ($Action) {
        'on' {
            Enable-ScheduledTask -TaskName $taskName | Out-Null
            $message = 'Scheduled execution enabled. This does not start a run now.'
        }
        'off' {
            Disable-ScheduledTask -TaskName $taskName | Out-Null
            $message = 'Future runs disabled. An already running development session continues.'
        }
        'run' {
            $task = Get-ScheduledTask -TaskName $taskName
            if ($task.State -eq 'Disabled') { throw 'Schedule is disabled. Use make autopilot-on first.' }
            if ($task.State -eq 'Running') { throw 'Already running; no additional run was started.' }
            Start-ScheduledTask -TaskName $taskName
            $message = 'Start requested. Use status and logs to verify the result.'
        }
        'apply' {
            $task = Get-ScheduledTask -TaskName $taskName
            if ($task.State -eq 'Running') { throw 'Wait for the current run to finish before changing the schedule.' }
            $paused = $task.State -eq 'Disabled'
            try {
                & 'C:\Users\nishr\graph-autopilot\install-task-simple.ps1' -Distro Ubuntu -EveryHours $EveryHours -MaxRunMinutes $MaxRunMinutes | Out-Null
            } finally {
                if ($paused) { Disable-ScheduledTask -TaskName $taskName | Out-Null }
            }
            $message = 'Schedule updated from autopilot.env. Previous pause state preserved.'
        }
    }
    $task = Get-ScheduledTask -TaskName $taskName
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    Save-Result @{
        ok=$true; message=$message; state=[string]$task.State
        last=$info.LastRunTime.ToString('yyyy-MM-dd HH:mm:ss')
        next=$info.NextRunTime.ToString('yyyy-MM-dd HH:mm:ss')
        result=$info.LastTaskResult; logon=[string]$task.Principal.LogonType
        interval=$task.Triggers[0].Repetition.Interval
        until=$task.Triggers[0].EndBoundary
    }
} catch {
    Save-Result @{ok=$false; error=$_.Exception.Message}
    exit 1
}
