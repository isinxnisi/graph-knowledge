param(
    [int]$ScheduledRuns = 3,
    [int]$TimeoutSeconds = 360,
    [switch]$Baseline,
    [string]$Config = '/home/isinxnisi/.local/share/plunode-collection-worker/config.json',
    [string]$Distribution = 'Ubuntu',
    [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference = 'Stop'
# Passive diagnostics: no task triggering, approval changes, collection or KG operations.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public class ConsoleObservation {
    public string At; public string Kind; public string ClassName; public string ProcessName;
    public int ProcessId; public long Handle; public bool VisibleAtCallback;
}
public static class CollectionWindowProbe {
    public static ConcurrentQueue<ConsoleObservation> Records = new ConcurrentQueue<ConsoleObservation>();
    public static string Error;
    static Thread thread; static volatile bool running; static IntPtr hook;
    static readonly ManualResetEventSlim ready = new ManualResetEventSlim(false);
    static readonly Dictionary<long,bool> last = new Dictionary<long,bool>();
    static readonly WinEventProc callback = OnEvent;
    delegate void WinEventProc(IntPtr h, uint e, IntPtr w, int obj, int child, uint t, uint ms);
    delegate bool EnumProc(IntPtr w, IntPtr p);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x,y; }
    [StructLayout(LayoutKind.Sequential)] struct MSG {
        public IntPtr h; public uint msg; public UIntPtr wp; public IntPtr lp;
        public uint time; public POINT point; public uint priv;
    }
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWinEventHook(
        uint min, uint max, IntPtr module, WinEventProc callback, uint process, uint thread, uint flags);
    [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr hook);
    [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg, IntPtr h, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr p);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr w);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr w, uint flag);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr w, StringBuilder b, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr w, out uint p);
    static string Class(IntPtr w) { var b=new StringBuilder(256); GetClassName(w,b,b.Capacity); return b.ToString(); }
    static bool ConsoleClass(string c) {
        return c.IndexOf("console",StringComparison.OrdinalIgnoreCase)>=0 ||
               c.IndexOf("cascadia",StringComparison.OrdinalIgnoreCase)>=0 || c=="ApplicationFrameWindow";
    }
    static void Record(IntPtr w, string kind) {
        string c=Class(w);
        uint pid; GetWindowThreadProcessId(w,out pid); string name="exited";
        try { name=Process.GetProcessById((int)pid).ProcessName; } catch {}
        if(!ConsoleClass(c) && !System.Text.RegularExpressions.Regex.IsMatch(name,
            "^(powershell|pwsh|wscript|wsl|conhost|OpenConsole|WindowsTerminal)$",System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return;
        Records.Enqueue(new ConsoleObservation { At=DateTimeOffset.UtcNow.ToString("o"), Kind=kind,
            ClassName=c, ProcessName=name, ProcessId=(int)pid, Handle=w.ToInt64(),
            VisibleAtCallback=IsWindowVisible(w) });
    }
    static void OnEvent(IntPtr h,uint e,IntPtr w,int obj,int child,uint t,uint ms) {
        if(w==IntPtr.Zero || obj!=0 || child!=0 || GetAncestor(w,2)!=w) return;
        if(e==0x8002) Record(w,"show-event"); // Keep even if already hidden when callback arrives.
    }
    public static void Start() {
        running=true;
        thread=new Thread(delegate() {
            try {
                // Baseline windows are not counted just because they were already visible.
                EnumWindows(delegate(IntPtr w,IntPtr p) { last[w.ToInt64()]=IsWindowVisible(w); return true; },IntPtr.Zero);
                hook=SetWinEventHook(0x8002,0x8002,IntPtr.Zero,callback,0,0,2);
                if(hook==IntPtr.Zero) throw new Exception("WinEvent hook failed: "+Marshal.GetLastWin32Error());
                ready.Set();
                while(running) {
                    MSG msg;
                    while(PeekMessage(out msg,IntPtr.Zero,0,0,1)) { TranslateMessage(ref msg); DispatchMessage(ref msg); }
                    EnumWindows(delegate(IntPtr w,IntPtr p) {
                        long key=w.ToInt64(); bool visible=IsWindowVisible(w), before=false;
                        last.TryGetValue(key,out before);
                        if(visible && !before) Record(w,"visible-poll");
                        last[key]=visible; return true;
                    },IntPtr.Zero);
                    Thread.Sleep(20);
                }
            } catch(Exception e) { Error=e.ToString(); ready.Set(); }
            finally { if(hook!=IntPtr.Zero) UnhookWinEvent(hook); }
        });
        thread.IsBackground=true; thread.Start();
        if(!ready.Wait(5000) || Error!=null) throw new Exception(Error ?? "Window observer startup timeout");
    }
    public static void Stop() { running=false; if(thread!=null) thread.Join(5000); }
}
'@
function Assert-Check($Condition, [string]$Message) { if(-not $Condition){throw $Message} }
$taskFolder = Join-Path $env:USERPROFILE 'plunode-collection-worker'
$linuxHome = $Config.Substring(0,$Config.LastIndexOf('/'))
$healthFile = '\\wsl.localhost\' + $Distribution + $linuxHome.Replace('/','\') + '\health.json'
$service = New-Object -ComObject Schedule.Service
$service.Connect()
$folder = $service.GetFolder('\')
$initial = $folder.GetTask('Plunode-CollectionWorker')
$lastRun = $initial.LastRunTime.Ticks
$seen = @{}
$pending = @{}
$runs = @()
$launcherProcesses = @()
$unit = @()
$observedAt = [DateTimeOffset]::UtcNow
$failure = $null
$temp = $null
[CollectionWindowProbe]::Start()
try {
    if(-not $Baseline) {
        $temp = Join-Path $taskFolder ('hidden-test-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temp | Out-Null
        $fixture = Join-Path $temp 'path with spaces'
        New-Item -ItemType Directory -Path $fixture | Out-Null
        $launcher = Join-Path $temp 'worker.wsf'
        Copy-Item -LiteralPath (Join-Path $taskFolder 'worker.wsf') -Destination $launcher
        $fake = Join-Path $fixture 'runner.ps1'
        @'
param($Mode,$Config,$Distribution)
if($Mode -ne 'Run' -or $Config -ne '/home/test/config.json' -or $Distribution -ne 'Ubuntu'){exit 38}
Set-Content -LiteralPath (Join-Path $PSScriptRoot 'fixture.log') -Value 'started'
Start-Sleep -Milliseconds 1200
Add-Content -LiteralPath (Join-Path $PSScriptRoot 'fixture.log') -Value 'completed'
exit 37
'@ | Set-Content -LiteralPath $fake -Encoding ASCII
        foreach($case in @(
            @{Name='wait-and-exit-37-with-spaces'; Args=('"' + $launcher + '" "' + $fake + '" "/home/test/config.json" "Ubuntu"'); Exit=37},
            @{Name='missing-arguments-rejected'; Args=('"' + $launcher + '"'); Exit=2}
        )) {
            $start = [Diagnostics.ProcessStartInfo]::new()
            $start.FileName = Join-Path $env:SystemRoot 'System32\wscript.exe'
            $start.Arguments = '//B //NoLogo ' + $case.Args
            $start.UseShellExecute=$false; $start.CreateNoWindow=$true
            $process=[Diagnostics.Process]::new(); $process.StartInfo=$start
            $watch=[Diagnostics.Stopwatch]::StartNew(); [void]$process.Start()
            if(-not $process.WaitForExit(20000)){ $process.Kill(); throw 'Isolated launcher timeout' }
            $watch.Stop()
            Assert-Check ($process.ExitCode -eq $case.Exit) ('Launcher exit code mismatch: ' + $case.Name)
            if($case.Exit -eq 37){
                Assert-Check ($watch.ElapsedMilliseconds -ge 1200) 'Launcher returned before child completed'
                Assert-Check ((Get-Content -LiteralPath (Join-Path $fixture 'fixture.log') -Raw).Contains('completed')) 'Fixture log missing'
            }
            $unit += @{name=$case.Name; exitCode=$process.ExitCode; elapsedMilliseconds=$watch.ElapsedMilliseconds}
        }
    }
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
    while($runs.Count -lt $ScheduledRuns -and [DateTimeOffset]::UtcNow -lt $deadline) {
        # No window titles or unrelated process command lines are retained.
        foreach($p in [Diagnostics.Process]::GetProcessesByName('wscript')) {
            if(-not $seen.ContainsKey($p.Id)) {
                $details=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p.Id) -ErrorAction SilentlyContinue
                if($details -and $details.CommandLine -and $details.CommandLine.IndexOf(
                    (Join-Path $taskFolder 'worker.wsf'),[StringComparison]::OrdinalIgnoreCase) -ge 0) {
                    # LastRunTime can advance even when IgnoreNew skips a trigger. Track
                    # actual root processes and keep their handles to read real exit codes.
                    $started=[DateTimeOffset]$p.StartTime
                    if($started -ge $observedAt) {
                        [void]$p.Handle
                        $pending[$p.Id]=@{process=$p; started=$started}
                        $launcherProcesses += @{processId=$p.Id; startedAt=$started.ToUniversalTime().ToString('o');
                            observedAt=[DateTimeOffset]::UtcNow.ToString('o')}
                    }
                }
                if($details){$seen[$p.Id]=$true}
            }
        }
        $task = $folder.GetTask('Plunode-CollectionWorker')
        foreach($processId in @($pending.Keys)) {
            $entry=$pending[$processId]
            if(-not $entry.process.HasExited){continue}
            $started=$entry.started
            $h = Get-Content -LiteralPath $healthFile -Raw | ConvertFrom-Json
            $log = Get-Item -LiteralPath (Join-Path $taskFolder 'last-run.log')
            $runs += @{processId=$processId; startedAt=$started.ToUniversalTime().ToString('o');
                completedAt=[DateTimeOffset]::UtcNow.ToString('o'); exitCode=$entry.process.ExitCode;
                healthStatus=$h.status; healthCheckedAt=$h.checkedAt; logUpdatedAt=$log.LastWriteTimeUtc.ToString('o');
                healthFresh=([DateTimeOffset]::Parse($h.checkedAt) -ge $started.AddSeconds(-1));
                logFresh=($log.LastWriteTimeUtc -ge $started.UtcDateTime.AddSeconds(-1))}
            $entry.process.Dispose()
            $pending.Remove($processId)
            Write-Output ('Completed natural Worker run ' + $runs.Count + '/' + $ScheduledRuns + ': ' + $runs[-1].startedAt)
        }
        if($Baseline -and $task.LastRunTime.Ticks -ne $lastRun -and [int]$task.State -ne 4) {
            $started = [DateTimeOffset]$task.LastRunTime
            $h = Get-Content -LiteralPath $healthFile -Raw | ConvertFrom-Json
            $log = Get-Item -LiteralPath (Join-Path $taskFolder 'last-run.log')
            $runs += @{startedAt=$started.ToUniversalTime().ToString('o'); exitCode=$task.LastTaskResult;
                healthStatus=$h.status; healthCheckedAt=$h.checkedAt; logUpdatedAt=$log.LastWriteTimeUtc.ToString('o');
                healthFresh=([DateTimeOffset]::Parse($h.checkedAt) -ge $started.AddSeconds(-1));
                logFresh=($log.LastWriteTimeUtc -ge $started.UtcDateTime.AddSeconds(-1))}
            $lastRun=$task.LastRunTime.Ticks
        }
        Start-Sleep -Milliseconds 300
    }
    Assert-Check ($runs.Count -ge $ScheduledRuns) 'Not enough completed natural scheduled runs'
    foreach($r in $runs) {
        Assert-Check ($r.exitCode -eq 0 -and $r.healthStatus -eq 'online' -and $r.healthFresh -and $r.logFresh) 'Scheduled Worker did not complete healthy/fresh'
    }
} catch { $failure=$_.Exception.Message }
finally { [CollectionWindowProbe]::Stop() }
$windows = @([CollectionWindowProbe]::Records.ToArray())
if([CollectionWindowProbe]::Error) { $failure=[CollectionWindowProbe]::Error }
if(-not $Baseline -and $windows.Count -gt 0) { $failure='Console show events observed; inspect recorded process IDs' }
if(-not $Baseline -and $launcherProcesses.Count -lt $ScheduledRuns) { $failure='Did not observe all scheduled GUI launcher processes' }
$report = @{observedAt=$observedAt.ToString('o'); completedAt=[DateTimeOffset]::UtcNow.ToString('o');
    baseline=[bool]$Baseline; observer='WinEvent EVENT_OBJECT_SHOW plus 20ms visible-window polling';
    windowTitlesRecorded=$false; naturalScheduledRuns=$runs; launcherProcesses=$launcherProcesses;
    isolatedChecks=$unit; consoleObservations=$windows; fixtureDirectory=$temp;
    passed=($null -eq $failure); error=$failure}
[IO.File]::WriteAllText($Output,($report | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
Write-Output ('naturalRuns=' + $runs.Count + ' consoleObservations=' + $windows.Count + ' passed=' + $report.passed)
if($failure) { throw $failure }
