# Registration is a separate operator-approved activation operation. This file never enables the task.
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit)
$ErrorActionPreference = 'Stop'
$taskName = 'Plunode-Publication-Delivery'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Existing task preserved; inspect instead of overwriting.' }
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$script = "/usr/local/lib/plunode-receipts/$SourceCommit/scripts/publication-delivery.py"
$arguments = "-d Ubuntu -u isinxnisi -- /usr/bin/python3 -B $script --config /etc/plunode-publication/delivery.json --queue"
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wsl.exe" -Argument $arguments
$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $identity), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)))
$settings = New-ScheduledTaskSettingsSet -Disable -Hidden -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$definition = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Resume already signed publications only; no Codex, signing key or acceptance execution.'
Register-ScheduledTask -TaskName $taskName -InputObject $definition | Out-Null
$observed = Get-ScheduledTask -TaskName $taskName
if ($observed.Settings.Enabled) { throw 'Unexpected enabled task; inspect immediately.' }
@{ phase='delivery-task-registered-disabled'; task=$taskName; sourceCommit=$SourceCommit; enabled=$false; periodicMinutes=5; runLevel='Limited'; productionApplyCalls=0 } | ConvertTo-Json -Compress
