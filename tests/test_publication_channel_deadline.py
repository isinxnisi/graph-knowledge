"""Channel lifetime tests. No live keys, VPS or KG."""
import datetime as dt
import importlib.util
from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]/'scripts/publication-executor.py'
spec=importlib.util.spec_from_file_location('deadline_executor',P);e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
class DeadlineTests(unittest.TestCase):
    def run_channel(self,parts,delays,seconds=60):
        start=dt.datetime(2026,10,23,tzinfo=dt.timezone.utc);elapsed=[0.0];timeouts=[];chunks=iter(parts);times=iter(delays)
        def wait(reads,writes,errors,timeout):
            timeouts.append(timeout);elapsed[0]+=next(times);return (reads,[],[])
        result=e.read_attestation(7,(start+dt.timedelta(seconds=seconds)).isoformat(),utc_now=lambda:start+dt.timedelta(seconds=elapsed[0]),monotonic=lambda:elapsed[0],wait=wait,read_bytes=lambda fd,size:next(chunks))
        return result,timeouts
    def test_twenty_five_second_receipt_proof_is_allowed_within_existing_sixty_second_expiry(self):
        result,timeouts=self.run_channel([b'{"proof":true}\n'],[25]);self.assertEqual(result,{'proof':True});self.assertEqual(timeouts,[60])
    def test_partial_response_does_not_extend_deadline(self):
        with self.assertRaisesRegex(ValueError,'expired|timed out'):self.run_channel([b'{',b'"proof":true}\n'],[30,31])
    def test_partial_stream_uses_remaining_budget(self):
        result,timeouts=self.run_channel([b'{',b'"proof":true}\n'],[25,20]);self.assertEqual(timeouts,[60,35]);self.assertTrue(result['proof'])
    def test_eof_oversize_and_extra_line_are_rejected(self):
        for data in [b'',b'x'*16385,b'{}\n{}\n']:
            with self.subTest(data=data[:5]),self.assertRaises(ValueError):self.run_channel([data],[1])
    def test_expired_response_is_not_waited_for(self):
        start=dt.datetime.now(dt.timezone.utc)
        with self.assertRaises(ValueError):e.read_attestation(7,start.isoformat(),utc_now=lambda:start,wait=lambda *a:self.fail('expired response must not wait'))
    def test_wall_clock_jump_past_expiry_is_rejected(self):
        start=dt.datetime.now(dt.timezone.utc);times=iter([start,start+dt.timedelta(seconds=100)])
        with self.assertRaises(ValueError):e.read_attestation(7,(start+dt.timedelta(seconds=60)).isoformat(),utc_now=lambda:next(times),monotonic=lambda:0,wait=lambda r,*a:(r,[],[]),read_bytes=lambda *a:b'{}\n')
    def test_real_pipe_complete_response_succeeds_and_partial_response_times_out(self):
        import subprocess,sys,json
        code="import importlib.util,datetime as d,json; s=importlib.util.spec_from_file_location('pipe_executor',"+repr(str(P))+"); m=importlib.util.module_from_spec(s);s.loader.exec_module(m); print(json.dumps(m.exchange_stdio({'expiresAt':(d.datetime.now(d.timezone.utc)+d.timedelta(seconds=.4)).isoformat()})))"
        for payload,expected in [(b'{"proof":true}\n',0),(b'{',1)]:
            child=subprocess.Popen([sys.executable,'-B','-c',code],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                self.assertIn(b'challenge',child.stdout.readline());child.stdin.write(payload);child.stdin.flush()
                self.assertEqual(child.wait(timeout=3),expected)
            finally:
                if child.poll() is None:child.kill();child.wait(timeout=3)
                child.stdin.close();child.stdout.close();child.stderr.close()
if __name__=='__main__':unittest.main()
