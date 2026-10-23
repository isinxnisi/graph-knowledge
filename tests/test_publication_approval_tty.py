"""Actual PTY confirmation with a dummy release only: no key, SSH, signature or KG."""
import errno
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import sys
import time
import unittest

PROGRAM=Path(__file__).resolve().parents[1]/'ops/plunode-publication-approve'
LOADER=importlib.machinery.SourceFileLoader('isolated_approval_tty',str(PROGRAM))
SPEC=importlib.util.spec_from_loader(LOADER.name,LOADER)
MODULE=importlib.util.module_from_spec(SPEC);LOADER.exec_module(MODULE)
DUMMY='isolated-no-publication-release'
PROMPT='本番公開を承認するrelease IDを入力してください: '.encode()


class ApprovalTerminalTests(unittest.TestCase):
    def terminal(self,answer,legacy=False):
        pid,fd=pty.fork()
        if pid==0:
            try:
                if legacy:
                    with open('/dev/tty','r+'):
                        pass
                else:
                    MODULE.confirm_release(DUMMY)
                os._exit(0)
            except Exception as exc:
                os.write(1,('TEST_EXCEPTION:'+type(exc).__name__+'\n').encode())
                os._exit(1)
        output=b'';sent=False;status=None;deadline=time.monotonic()+5
        try:
            while time.monotonic()<deadline:
                ready,_,_=select.select([fd],[],[],0.1)
                if ready:
                    try:chunk=os.read(fd,4096)
                    except OSError as exc:
                        if exc.errno!=errno.EIO:raise
                        chunk=b''
                    output+=chunk
                    if not sent and PROMPT in output:
                        # Synthetic isolated confirmation only. Never production argv/key.
                        os.write(fd,answer);sent=True
                done,value=os.waitpid(pid,os.WNOHANG)
                if done:status=value;break
            self.assertIsNotNone(status,'isolated PTY child timed out')
            return os.waitstatus_to_exitcode(status),output
        finally:
            if status is None:
                os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
            os.close(fd)

    def test_matching_release_requires_visible_prompt_and_tty_input(self):
        code,output=self.terminal((DUMMY+'\n').encode())
        self.assertEqual(code,0);self.assertIn(PROMPT,output)

    def test_different_release_stops(self):
        code,output=self.terminal(b'wrong-isolated-release\n')
        self.assertEqual(code,1);self.assertIn(b'TEST_EXCEPTION:ValueError',output)

    def test_eof_stops(self):
        code,output=self.terminal(b'\x04')
        self.assertEqual(code,1);self.assertIn(b'TEST_EXCEPTION:ValueError',output)

    def test_old_update_mode_reproduces_pre_prompt_failure(self):
        code,output=self.terminal(b'',legacy=True)
        self.assertEqual(code,1);self.assertIn(b'TEST_EXCEPTION:UnsupportedOperation',output)
        self.assertNotIn(PROMPT,output)

    def test_piped_input_without_controlling_tty_is_not_approval(self):
        code="import runpy;d=runpy.run_path("+repr(str(PROGRAM))+");d['confirm_release']("+repr(DUMMY)+")"
        result=subprocess.run([sys.executable,'-I','-c',code],input=DUMMY+'\n',
            text=True,capture_output=True,start_new_session=True,timeout=5)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('OSError',result.stderr)

if __name__=='__main__':unittest.main()
