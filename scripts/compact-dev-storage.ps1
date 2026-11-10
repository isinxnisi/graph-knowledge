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
Write-Host 'Stopping local WSL services for compaction. Production VPS is unchanged.'
try {
    # Only these local Plunode timers are paused, then restored in finally.
    # GraphKnowledge-Autopilot is intentionally not modified.
    foreach ($taskName in @('Plunode-CollectionWorker','Plunode-Publication-Delivery','Plunode-WorkStatus','Plunode-AI-Education')) {
        $taskItem = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($null -ne $taskItem -and $taskItem.Settings.Enabled) {
            $taskChangedTasks += [pscustomobject]@{Name=$taskName;Path=$taskItem.TaskPath;WasRunning=($taskItem.State -eq 'Running')}
            Disable-ScheduledTask -TaskName $taskName -TaskPath $taskItem.TaskPath | Out-Null
            if ($taskItem.State -eq 'Running') {
                $taskWaitUntil = (Get-Date).AddMinutes(3)
                do {
                    Start-Sleep -Seconds 2
                    $taskStateNow = (Get-ScheduledTask -TaskName $taskName -TaskPath $taskItem.TaskPath).State
                } until ($taskStateNow -ne 'Running' -or (Get-Date) -gt $taskWaitUntil)
                if ($taskStateNow -eq 'Running') { throw "Task is still running; no compaction started: $taskName" }
            }
        }
    }
    $taskRunning = @($taskBaseline | Where-Object Running | ForEach-Object Id)
    if ($taskRunning.Count -gt 0) { Write-Host (Invoke-Checked $taskDocker (@('--context','desktop-linux','stop','--time','60') + $taskRunning)) }
    Write-Host (Invoke-Checked 'wsl.exe' @('-d','docker-desktop','-u','root','--','fstrim','-v','/mnt/docker-desktop-disk'))
    Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','-u','root','--','fstrim','-v','/'))
    Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','-u','root','--','sync'))
    # Set this before requesting stop so a partial stop is also recovered.
    $taskStoppedDocker = $true
    Write-Host (Invoke-Checked $taskDocker @('desktop','stop','--timeout','60'))
    Write-Host (Invoke-Checked 'wsl.exe' @('--shutdown'))
    Start-Sleep -Seconds 3
    foreach ($taskDisk in $taskDisks) {
        # Refuse to compact a disk held by any running WSL instance.
        $taskHandle = [System.IO.File]::Open($taskDisk,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None)
        $taskHandle.Dispose()
        $taskIndex = [array]::IndexOf($taskDisks,$taskDisk)
        $taskCommandFile = Join-Path $taskRoot "diskpart-$taskIndex.txt"
        @(('select vdisk file="{0}"' -f $taskDisk); 'compact vdisk'; 'exit') | Set-Content -LiteralPath $taskCommandFile -Encoding ASCII
        Write-Host "Compacting $taskDisk"
        $taskDiskOutput = Invoke-Checked 'diskpart.exe' @('/s',$taskCommandFile)
        $taskDiskOutput | Set-Content -LiteralPath (Join-Path $taskRoot "diskpart-$taskIndex.log") -Encoding UTF8
        Write-Host $taskDiskOutput
        if ($taskDiskOutput -match '(?i)error|failed|denied|エラー|失敗|拒否') { throw 'DiskPart reported an error; inspect the saved log.' }
    }
} catch { $taskError = $_; Write-Warning $_.Exception.Message }
finally {
    try {
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
        Write-Host (Invoke-Checked 'wsl.exe' @('-d','Ubuntu','--','python3',"$taskRepo/scripts/start-local-previews.py",'beta','--node',$taskNode))
        $taskVolumesAfter = @((Invoke-Checked $taskDocker @('--context','desktop-linux','volume','ls','--format','{{.Name}}')).Trim() -split '\r?\n' | Sort-Object)
        if (Compare-Object $taskVolumes $taskVolumesAfter) { throw 'Docker volume inventory changed; inspect before continuing.' }
        foreach ($taskEntry in $taskBaseline) {
            $taskImage = (Invoke-Checked $taskDocker @('--context','desktop-linux','inspect','--format','{{.Image}}',$taskEntry.Id)).Trim()
            if ($taskImage -ne $taskEntry.Image) { throw "Container image changed: $($taskEntry.Name)" }
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
