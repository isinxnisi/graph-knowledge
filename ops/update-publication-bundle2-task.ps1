$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$from = '__FROM__'
$to = '__TO__'
if ($from -notmatch '^[a-f0-9]{40}$' -or $to -notmatch '^[a-f0-9]{40}$') { throw 'Fixed source commits required' }
$name = 'Plunode-Publication-Delivery'
$before = Get-ScheduledTask -TaskName $name
if ([string]$before.State -eq 'Running') { throw 'Delivery task is running; no task changed' }
if ($before.Actions.Count -ne 1) { throw 'Single existing action required' }
$action = $before.Actions[0]
$expected = '//B //NoLogo "C:\Users\nishr\plunode-publication-delivery\delivery.wsf" ' + $from
if ($action.Execute -cne 'C:\WINDOWS\System32\wscript.exe' -or $action.Arguments -cne $expected -or $action.WorkingDirectory -cne 'C:\Users\nishr\plunode-publication-delivery') { throw 'Task action advanced; preserve and inspect' }
$xmlBefore = Export-ScheduledTask -TaskName $name
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$securityBefore = $scheduler.GetFolder('\').GetTask($name).GetSecurityDescriptor(4)
function Core([string]$text) {
    [xml]$doc = $text
    $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')
    return (@('Triggers', 'Principals', 'Settings') | ForEach-Object { $doc.SelectSingleNode('/t:Task/t:' + $_, $ns).OuterXml }) -join "`n"
}
$replacement = New-ScheduledTaskAction -Execute $action.Execute -Argument ($expected.Substring(0, $expected.Length - 40) + $to) -WorkingDirectory $action.WorkingDirectory
if ($action.Id) { $replacement.Id = $action.Id }
$changed = $false
try {
    if ($from -cne $to) { $changed = $true; Set-ScheduledTask -TaskName $name -Action $replacement | Out-Null }
    $after = Get-ScheduledTask -TaskName $name
    if ((Core (Export-ScheduledTask -TaskName $name)) -cne (Core $xmlBefore) -or $scheduler.GetFolder('\').GetTask($name).GetSecurityDescriptor(4) -cne $securityBefore -or $after.Actions.Count -ne 1 -or $after.Actions[0].Arguments -cne $replacement.Arguments -or $after.Actions[0].Execute -cne $action.Execute -or $after.Actions[0].WorkingDirectory -cne $action.WorkingDirectory -or $after.Actions[0].Id -cne $action.Id) { throw 'Task preservation comparison failed' }
} catch {
    if ($changed) { Set-ScheduledTask -TaskName $name -Action $action | Out-Null }
    throw
}
[ordered]@{ task = $name; sourceBefore = $from; sourceAfter = $to; triggerPrincipalSettingsPreserved = $true; beforeXmlBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($xmlBefore)); permissionChanged = $false } | ConvertTo-Json -Compress
