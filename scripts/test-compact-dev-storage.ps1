$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskSource = Join-Path $PSScriptRoot 'compact-dev-storage.ps1'
$taskTokens=$null; $taskErrors=$null
$taskAst=[System.Management.Automation.Language.Parser]::ParseFile($taskSource,[ref]$taskTokens,[ref]$taskErrors)
if ($taskErrors.Count) { throw ($taskErrors | Out-String) }
foreach ($taskFunctionName in @('Suspend-LocalTimer','Invoke-OfflineCompact','Invoke-Checked')) {
    $taskFunction=$taskAst.Find({param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq $taskFunctionName},$true)
    Invoke-Expression $taskFunction.Extent.Text
}
$script:taskCalls=[System.Collections.Generic.List[string]]::new()
function Disable-ScheduledTask { param($TaskName,$TaskPath) $script:taskCalls.Add("disable:$TaskName") }
function Stop-ScheduledTask { param($TaskName,$TaskPath) $script:taskCalls.Add("stop:$TaskName") }
Suspend-LocalTimer ([pscustomobject]@{TaskName='test';TaskPath='\';State='Running'})
if (($taskCalls -join ',') -ne 'disable:test,stop:test') { throw 'Running timer must be disabled and stopped without waiting.' }
$taskCalls.Clear()
Suspend-LocalTimer ([pscustomobject]@{TaskName='test';TaskPath='\';State='Ready'})
if (($taskCalls -join ',') -ne 'disable:test') { throw 'Idle timer should only be disabled.' }
function Invoke-Checked { param($File,$Arguments) $script:taskCalls.Add("$File $($Arguments -join ' ')"); return 'ok' }
$taskCalls.Clear(); $null=Invoke-OfflineCompact 'C:\test.txt'
if (($taskCalls -join ',') -ne 'wsl.exe --shutdown,diskpart.exe /s C:\test.txt') { throw 'Shutdown must be immediately followed by DiskPart.' }
function Invoke-Checked { param($File,$Arguments) $script:taskCalls.Add($File); throw 'simulated shutdown failure' }
$taskCalls.Clear()
try { $null=Invoke-OfflineCompact 'C:\test.txt'; throw 'Expected failure' } catch { if ($_.Exception.Message -ne 'simulated shutdown failure') { throw } }
if (($taskCalls -join ',') -ne 'wsl.exe') { throw 'DiskPart must not run after shutdown failure.' }
# Exercise the actual restoration body for the failed-before-stop path.
$taskMainTry=$taskAst.EndBlock.Statements | Where-Object {$_ -is [System.Management.Automation.Language.TryStatementAst] -and $null -ne $_.Finally} | Select-Object -First 1
$taskRestoreTry=$taskMainTry.Finally.Statements[0]
$taskBody=$taskRestoreTry.Body.Extent.Text
$taskBody=$taskBody.Substring(1,$taskBody.Length-2)
$taskServicesTouched=$false; $taskCalls.Clear()
& ([scriptblock]::Create($taskBody))
if ($taskCalls.Count -ne 0) { throw 'Failed-before-stop must not restart Docker or beta.' }
# Test the owned-server resume branch with the real Windows PowerShell -> WSL boundary.
$taskProbeAssignment=$taskAst.Find({param($a) $a -is [System.Management.Automation.Language.AssignmentStatementAst] -and $a.Left.Extent.Text -eq '$taskResumePreview'},$true)
$taskProbe=$taskProbeAssignment.Right.Expression.Value
$taskNativeFunction=$taskAst.Find({param($a) $a -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $a.Name -eq 'Invoke-Checked'},$true)
Invoke-Expression $taskNativeFunction.Extent.Text
$taskResult=Invoke-Checked 'wsl.exe' @('-d','Ubuntu','--','python3','-c',$taskProbe,'/home/isinxnisi/1.projects/7.graph-knowledge','/home/isinxnisi/1.projects/.worktrees/graph-issue75-theme-foundation/.local/issue75/node')
if ($taskResult -notmatch 'no duplicate startup') { throw 'Expected verified beta to remain running.' }
Write-Output 'Storage maintenance checks: 6 passed (timer running/idle, immediate order, shutdown failure, early abort, real owned-beta resume).'
