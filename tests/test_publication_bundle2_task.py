"""Task errors remain diagnosable; script tests replace every Task mutation with a fake."""
import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bundle2_task_applier_test', ROOT / 'ops/apply-publication-bundle2-update.py')
apply = importlib.util.module_from_spec(spec); spec.loader.exec_module(apply)
POWERSHELL = Path('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')


class TaskDiagnostics(unittest.TestCase):
    def test_original_exception_and_rollback_failure_are_preserved(self):
        failure = {'error': 'windows-task-update-stopped', 'stage': 'set-action', 'exceptionType': 'System.UnauthorizedAccessException',
                   'hresult': -2147024891, 'message': 'isolated-access-denied', 'errorId': 'isolated-id', 'rollback': 'unverified: isolated-rollback-error',
                   'beforeXmlBase64': 'must-not-export'}
        with tempfile.TemporaryDirectory() as folder:
            files = Path(folder); (files / 'update-task.ps1').write_text('fixed script')
            with patch.object(apply.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout=json.dumps(failure).encode(), stderr=b'')), self.assertRaises(ValueError):
                apply.windows_task(files, apply.OLD_SOURCE, apply.SOURCE, '/run/WSL/123_interop')
        self.assertEqual(apply.DIAGNOSTICS['windowsTaskFailure']['hresult'], -2147024891)
        self.assertEqual(apply.DIAGNOSTICS['windowsTaskFailure']['rollback'], failure['rollback'])
        self.assertNotIn('beforeXmlBase64', apply.DIAGNOSTICS['windowsTaskFailure'])

    def test_unstructured_native_error_is_not_replaced_by_generic_success(self):
        with tempfile.TemporaryDirectory() as folder:
            files = Path(folder); (files / 'update-task.ps1').write_text('fixed script')
            for output in [b'not-json', b'[]', b'{"status":"unexpected"}']:
                with patch.object(apply.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout=output, stderr=b'isolated-native-error')), self.assertRaises(ValueError):
                    apply.windows_task(files, apply.OLD_SOURCE, apply.SOURCE, '/run/WSL/123_interop')
        self.assertEqual(apply.DIAGNOSTICS['windowsTaskFailure']['returnCode'], 1)

    @unittest.skipUnless(POWERSHELL.exists(), 'Windows PowerShell required for the isolated script interpreter')
    def test_powershell_update_busy_error_and_rollback_contract(self):
        # Only the real scheduler's security descriptor is read. Get/Export/New/Set
        # below are local fakes; Set never forwards to the real scheduler/cmdlet.
        fixture = r'''
$script:FakeMode = '__MODE__'
$script:FakeSetCount = 0
$script:FakeAction = [pscustomobject]@{Execute='C:\WINDOWS\System32\wscript.exe'; Arguments='//B //NoLogo "C:\Users\nishr\plunode-publication-delivery\delivery.wsf" __FROM__'; WorkingDirectory='C:\Users\nishr\plunode-publication-delivery'; Id=$null}
function Get-ScheduledTask { param($TaskName) return [pscustomobject]@{State=$(if($script:FakeMode -eq 'busy'){'Running'}else{'Ready'}); Actions=@($script:FakeAction)} }
function Export-ScheduledTask { param($TaskName)
    $setting = if($script:FakeMode -eq 'preservation' -and $script:FakeSetCount -eq 1){'changed'}else{'fixed'}
    return '<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers/><Principals/><Settings><Hidden>'+ $setting +'</Hidden></Settings></Task>'
}
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) return [pscustomobject]@{Execute=$Execute; Arguments=$Argument; WorkingDirectory=$WorkingDirectory; Id=$null} }
function Set-ScheduledTask { param($TaskName,$Action)
    $script:FakeSetCount++
    if($script:FakeMode -eq 'denied' -and $script:FakeSetCount -eq 1){throw [UnauthorizedAccessException]::new('isolated-access-denied')}
    if($script:FakeMode -eq 'rollback-denied'){throw [UnauthorizedAccessException]::new('isolated-denied-'+$script:FakeSetCount)}
    $script:FakeAction = $Action
}
'''
        script = (ROOT / 'ops/update-publication-bundle2-task.ps1').read_text()
        outcomes = {}
        for mode in ['success', 'snapshot', 'busy', 'denied', 'preservation', 'rollback-denied', 'baseline-drift']:
            old = apply.OLD_SOURCE; new = old if mode == 'snapshot' else apply.SOURCE
            text = fixture.replace('__MODE__', mode).replace('__FROM__', old) + '\n' + script.replace('__FROM__', old).replace('__TO__', new)
            text = text.replace('__BASELINE_XML__', base64.b64encode(b'drifted-snapshot').decode() if mode == 'baseline-drift' else '').replace('__BASELINE_SECURITY__', '')
            result = subprocess.run([str(POWERSHELL), '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', base64.b64encode(text.encode('utf-16-le')).decode()], capture_output=True, timeout=60)
            value = json.loads(result.stdout.decode('utf-8-sig')); outcomes[mode] = value
            self.assertEqual(result.returncode, 0 if mode in ['success', 'snapshot'] else 1, msg=value)
        for mode in ['success', 'snapshot']:
            self.assertEqual(outcomes[mode]['status'], 'verified')
            self.assertTrue(outcomes[mode]['triggerPrincipalSettingsPreserved'])
        self.assertEqual(outcomes['busy']['stage'], 'read-before')
        self.assertEqual(outcomes['busy']['rollback'], 'not-needed')
        self.assertEqual(outcomes['denied']['message'], 'isolated-access-denied')
        self.assertEqual(outcomes['denied']['stage'], 'set-action')
        self.assertEqual(outcomes['denied']['rollback'], 'verified')
        self.assertEqual(outcomes['preservation']['stage'], 'verify-after')
        self.assertEqual(outcomes['preservation']['rollback'], 'verified')
        self.assertIn('isolated-denied-1', outcomes['rollback-denied']['message'])
        self.assertIn('isolated-denied-2', outcomes['rollback-denied']['rollback'])
        self.assertEqual(outcomes['baseline-drift']['stage'], 'read-before')
        self.assertEqual(outcomes['baseline-drift']['rollback'], 'not-needed')


if __name__ == '__main__': unittest.main()
