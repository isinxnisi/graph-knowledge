$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$from = '__FROM__'
$to = '__TO__'
$baselineXml = '__BASELINE_XML__'
$baselineSecurity = '__BASELINE_SECURITY__'
$stage = 'read-before'
$changed = $false
$rollback = 'not-needed'
function Hash([string]$text) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
}
function Core([string]$text) {
    [xml]$doc = $text
    $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
    $ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')
    return (@('Triggers', 'Principals', 'Settings') | ForEach-Object { $doc.SelectSingleNode('/t:Task/t:' + $_, $ns).OuterXml }) -join "`n"
}
try {
    if ($from -notmatch '^[a-f0-9]{40}$' -or $to -notmatch '^[a-f0-9]{40}$') { throw 'Fixed source commits required' }
    $name = 'Plunode-Publication-Delivery'
    $before = Get-ScheduledTask -TaskName $name
    if ([string]$before.State -ne 'Ready') { throw 'Delivery task is not idle; no task changed' }
    if ($before.Actions.Count -ne 1) { throw 'Single existing action required' }
    $action = $before.Actions[0]
    $expected = '//B //NoLogo "C:\Users\nishr\plunode-publication-delivery\delivery.wsf" ' + $from
    if ($action.Execute -cne 'C:\WINDOWS\System32\wscript.exe' -or $action.Arguments -cne $expected -or $action.WorkingDirectory -cne 'C:\Users\nishr\plunode-publication-delivery') { throw 'Task action advanced; preserve and inspect' }
    $xmlBefore = Export-ScheduledTask -TaskName $name
    $scheduler = New-Object -ComObject 'Schedule.Service'
    $scheduler.Connect()
    $securityBefore = $scheduler.GetFolder('\').GetTask($name).GetSecurityDescriptor(4)
    $securityHash = Hash $securityBefore
    if ($baselineXml -and ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($baselineXml)) -cne $xmlBefore -or $baselineSecurity -cne $securityHash)) { throw 'Task snapshot advanced; no task changed' }
    $replacement = New-ScheduledTaskAction -Execute $action.Execute -Argument ($expected.Substring(0, $expected.Length - 40) + $to) -WorkingDirectory $action.WorkingDirectory
    if ($action.Id) { $replacement.Id = $action.Id }
    $stage = 'set-action'
    if ($from -cne $to) {
        # Recheck immediately before the only mutation. Root has already saved XML.
        if ([string](Get-ScheduledTask -TaskName $name).State -ne 'Ready') { throw 'Delivery task became busy; no task changed' }
        $changed = $true
        Set-ScheduledTask -TaskName $name -Action $replacement | Out-Null
    }
    $stage = 'verify-after'
    $after = Get-ScheduledTask -TaskName $name
    if ((Core (Export-ScheduledTask -TaskName $name)) -cne (Core $xmlBefore) -or $scheduler.GetFolder('\').GetTask($name).GetSecurityDescriptor(4) -cne $securityBefore -or $after.Actions.Count -ne 1 -or $after.Actions[0].Arguments -cne $replacement.Arguments -or $after.Actions[0].Execute -cne $action.Execute -or $after.Actions[0].WorkingDirectory -cne $action.WorkingDirectory -or $after.Actions[0].Id -cne $action.Id) { throw 'Task preservation comparison failed' }
    [ordered]@{ status = 'verified'; task = $name; sourceBefore = $from; sourceAfter = $to; triggerPrincipalSettingsPreserved = $true; beforeXmlBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($xmlBefore)); securityDescriptorSha256 = $securityHash; permissionChanged = $false } | ConvertTo-Json -Compress
} catch {
    $original = $_
    if ($changed) {
        try {
            Set-ScheduledTask -TaskName $name -Action $action | Out-Null
            $restored = Get-ScheduledTask -TaskName $name
            if ((Core (Export-ScheduledTask -TaskName $name)) -cne (Core $xmlBefore) -or $scheduler.GetFolder('\').GetTask($name).GetSecurityDescriptor(4) -cne $securityBefore -or $restored.Actions.Count -ne 1 -or $restored.Actions[0].Arguments -cne $action.Arguments -or $restored.Actions[0].Execute -cne $action.Execute -or $restored.Actions[0].WorkingDirectory -cne $action.WorkingDirectory -or $restored.Actions[0].Id -cne $action.Id) { throw 'Task rollback comparison failed' }
            $rollback = 'verified'
        } catch { $rollback = 'unverified: ' + $_.Exception.Message }
    }
    [ordered]@{ error = 'windows-task-update-stopped'; stage = $stage; exceptionType = $original.Exception.GetType().FullName; hresult = $original.Exception.HResult; message = $original.Exception.Message; errorId = $original.FullyQualifiedErrorId; rollback = $rollback } | ConvertTo-Json -Compress
    exit 1
}
