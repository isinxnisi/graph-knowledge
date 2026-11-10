#Requires -RunAsAdministrator
# Plunode development storage maintenance; no format, reset, unregister, or volume deletion.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
if ($taskRoot.StartsWith('\\')) { throw 'Copy this script to a Windows local folder before running; WSL will be shut down.' }
Set-Location -LiteralPath $env:USERPROFILE
$taskDocker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$taskDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$taskUbuntu = Join-Path $env:LOCALAPPDATA 'Packages\CanonicalGroupLimited.Ubuntu_79rhkp1fndgsc\LocalState\ext4.vhdx'
$taskDockerDisk = Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'
$taskRepo = '/home/isinxnisi/1.projects/7.graph-knowledge'
$taskNode = '/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node'
$taskDisks = @($taskUbuntu, $taskDockerDisk)
$taskChangedTasks = @()
$taskStarted = Get-Date
$taskFreeBefore = (Get-PSDrive C).Free
$taskBefore = @($taskDisks | ForEach-Object { [pscustomobject]@{Path=$_;Bytes=(Get-Item -LiteralPath $_).Length} })
$taskStoppedDocker = $false
$taskServicesTouched = $false
$taskWslStopAttempted = $false
$taskError = $null
$taskRestorationError = $null
function Invoke-Checked {
    param([string]$File, [string[]]$Arguments)
    $taskOldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $taskOutput = (& $File @Arguments 2>&1 | Out-String); $taskCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $taskOldPreference }
    if ($taskCode -ne 0) { throw "$File exited $taskCode : $taskOutput" }
    return $taskOutput
}
function Suspend-LocalTimer {
    param($Timer)
    Disable-ScheduledTask -TaskName $Timer.TaskName -TaskPath $Timer.TaskPath | Out-Null
    if ($Timer.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $Timer.TaskName -TaskPath $Timer.TaskPath
    }
}
function Invoke-OfflineCompact {
    param([string]$CommandFile)
    # No WSL query, path check, file generation, logging, or sleep between these calls.
    $null = Invoke-Checked 'wsl.exe' @('--shutdown')
    return Invoke-Checked 'diskpart.exe' @('/s',$CommandFile)
}
foreach ($taskPath in @($taskDocker,$taskDesktop) + $taskDisks) {
    if (-not (Test-Path -LiteralPath $taskPath -PathType Leaf)) { throw "Required file missing: $taskPath" }
}
$taskContainerIds = (Invoke-Checked $taskDocker @('--context','desktop-linux','ps','-aq')).Trim() -split '\s+'
$taskBaseline = @()
foreach ($taskId in $taskContainerIds) {
    if (-not $taskId) { continue }
    $taskInspect = @(ConvertFrom-Json (Invoke-Checked $taskDocker @('--context','desktop-linux','inspect',$taskId)))[0]
    $taskBaseline += [pscustomobject]@{Id=$taskInspect.Id;Name=$taskInspect.Name.TrimStart('/');Running=$taskInspect.State.Running;Image=$taskInspect.Image}
}
$taskVolumes = @((Invoke-Checked $taskDocker @('--context','desktop-linux','volume','ls','--format','{{.Name}}')).Trim() -split '\r?\n' | Sort-Object)
$taskBaseline | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRoot 'containers-at-compaction.json') -Encoding UTF8
# Prepare all DiskPart input while WSL is still running.
$taskCommandFile = Join-Path $taskRoot 'diskpart-compact.txt'
$taskDiskCommands = @()
foreach ($taskDisk in $taskDisks) {
    $taskDiskCommands += ('select vdisk file="{0}"' -f $taskDisk)
    $taskDiskCommands += 'compact vdisk'
}
$taskDiskCommands += 'exit'
$taskDiskCommands | Set-Content -LiteralPath $taskCommandFile -Encoding ASCII
Write-Host 'Stopping local WSL services for compaction. Production VPS is unchanged.'
try {
    # Only these local Plunode timers are paused, then restored in finally.
    # GraphKnowledge-Autopilot is intentionally not modified.
    foreach ($taskName in @('Plunode-CollectionWorker','Plunode-Publication-Delivery','Plunode-WorkStatus','Plunode-AI-Education')) {
        $taskItem = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($null -ne $taskItem -and $taskItem.Settings.Enabled) {
            $taskChangedTasks += [pscustomobject]@{Name=$taskName;Path=$taskItem.TaskPath;WasRunning=($taskItem.State -eq 'Running')}
            Suspend-LocalTimer $taskItem
        }
    }
    $taskRunning = @($taskBaseline | Where-Object Running | ForEach-Object Id)
    $taskServicesTouched = $true
    if ($taskRunning.Count -gt 0) { Write-Host (Invoke-Checked $taskDocker (@('--context','desktop-linux','stop','--time','60') + $taskRunning)) }
    Write-Host (Invoke-Checked 'wsl.exe' @('-d','docker-desktop','-u','root','--','fstrim','-v','/mnt/docker-desktop-disk'))
    Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','-u','root','--','fstrim','-v','/'))
    Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','-u','root','--','sync'))
    # Set this before requesting stop so a partial stop is also recovered.
    $taskStoppedDocker = $true
    Write-Host (Invoke-Checked $taskDocker @('desktop','stop','--timeout','60'))
    $taskWslStopAttempted = $true
    $taskDiskOutput = Invoke-OfflineCompact $taskCommandFile
    $taskDiskOutput | Set-Content -LiteralPath (Join-Path $taskRoot 'diskpart-compact.log') -Encoding UTF8
    Write-Host $taskDiskOutput
    if ($taskDiskOutput -match '(?i)error|failed|denied|エラー|失敗|拒否') { throw 'DiskPart reported an error; inspect the saved log.' }
} catch { $taskError = $_; Write-Warning $_.Exception.Message }
finally {
    try {
        if ($taskServicesTouched) {
            if ($taskStoppedDocker) {
                Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','--','true'))
                Write-Host 'Restarting Docker Desktop and the containers that were running.'
                Start-Process -FilePath $taskDesktop -WindowStyle Hidden
                $taskDeadline = (Get-Date).AddMinutes(3)
                $taskEngineReady = $false
                do {
                    Start-Sleep -Seconds 3
                    try { $null = Invoke-Checked $taskDocker @('--context','desktop-linux','info','--format','{{.ServerVersion}}'); $taskEngineReady = $true } catch {}
                } until ($taskEngineReady -or (Get-Date) -gt $taskDeadline)
                if (-not $taskEngineReady) { throw 'Docker did not become ready in 3 minutes.' }
            }
            foreach ($taskEntry in @($taskBaseline | Where-Object Running)) {
                $taskState = (Invoke-Checked $taskDocker @('--context','desktop-linux','inspect','--format','{{.State.Running}}',$taskEntry.Id)).Trim()
                if ($taskState -ne 'true') { $null = Invoke-Checked $taskDocker @('--context','desktop-linux','start',$taskEntry.Id) }
            }
            foreach ($taskEntry in @($taskBaseline | Where-Object { -not $_.Running })) {
                $taskState = (Invoke-Checked $taskDocker @('--context','desktop-linux','inspect','--format','{{.State.Running}}',$taskEntry.Id)).Trim()
                if ($taskState -eq 'true') { $null = Invoke-Checked $taskDocker @('--context','desktop-linux','stop','--time','60',$taskEntry.Id) }
            }
            if ($taskWslStopAttempted) {
                # A failed shutdown may have left the verified beta alive. Do not launch twice.
                $taskResumePreview = @'
from pathlib import Path
import runpy,subprocess,sys
root=Path(sys.argv[1]);node=sys.argv[2];script=root/'scripts/start-local-previews.py'
api=runpy.run_path(str(script))
if api['listening'](3200):
    pidfile=Path.home()/'.local/state/plunode-previews/beta.pid'
    pid=pidfile.read_text().strip() if pidfile.exists() else ''
    proc=Path('/proc')/pid
    if not pid.isdigit() or not (proc/'cmdline').exists() or (proc/'cwd').resolve()!=root.resolve() or b'scripts/public-kg.ts' not in (proc/'cmdline').read_bytes():
        raise SystemExit('Port 3200 belongs to another process; no process was stopped.')
    print('beta: existing verified server remains running; no duplicate startup')
else:
    sys.exit(subprocess.run(['python3',str(script),'beta','--node',node]).returncode)
'@
                Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','--','python3','-c',$taskResumePreview,$taskRepo,$taskNode))
            }
            $taskVolumesAfter = @((Invoke-Checked $taskDocker @('--context','desktop-linux','volume','ls','--format','{{.Name}}')).Trim() -split '\r?\n' | Sort-Object)
            if (Compare-Object $taskVolumes $taskVolumesAfter) { throw 'Docker volume inventory changed; inspect before continuing.' }
            foreach ($taskEntry in $taskBaseline) {
                $taskImage = (Invoke-Checked $taskDocker @('--context','desktop-linux','inspect','--format','{{.Image}}',$taskEntry.Id)).Trim()
                if ($taskImage -ne $taskEntry.Image) { throw "Container image changed: $($taskEntry.Name)" }
            }
        }
    } catch { $taskRestorationError = $_; Write-Warning $_.Exception.Message }
    foreach ($taskEntry in $taskChangedTasks) {
        try {
            Enable-ScheduledTask -TaskName $taskEntry.Name -TaskPath $taskEntry.Path | Out-Null
            if ($taskEntry.WasRunning) { Start-ScheduledTask -TaskName $taskEntry.Name -TaskPath $taskEntry.Path }
        } catch { $taskRestorationError = $_; Write-Warning "Could not restore task $($taskEntry.Name): $_" }
    }
    $taskAfter = @($taskDisks | ForEach-Object { [pscustomobject]@{Path=$_;Bytes=(Get-Item -LiteralPath $_).Length} })
    $taskResult = [ordered]@{
        Started=$taskStarted.ToString('o');Finished=(Get-Date).ToString('o');DisksBefore=$taskBefore;DisksAfter=$taskAfter
        CFreeBefore=$taskFreeBefore;CFreeAfter=(Get-PSDrive C).Free
        CompactionSucceeded=($null -eq $taskError);RestorationSucceeded=($null -eq $taskRestorationError)
        Error=$(if ($taskError) {$taskError.Exception.Message} else {$null})
        RestorationError=$(if ($taskRestorationError) {$taskRestorationError.Exception.Message} else {$null})
        DatabaseReset=$false;VolumesDeleted=$false;ProductionVpsChanged=$false
    }
    $taskResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskRoot 'compact-result.json') -Encoding UTF8
    $taskResult | ConvertTo-Json -Depth 6 | Write-Host
}
if ($taskError) { throw $taskError }
if ($taskRestorationError) { throw $taskRestorationError }
Write-Host 'Compaction and local service restart finished. Codex will verify beta and service health.'
