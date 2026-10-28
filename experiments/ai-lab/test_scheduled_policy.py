import copy
from datetime import datetime,timezone,timedelta
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import autonomy as a
import mentorship as m
import scheduled_policy as s
import test_mentorship as fixtures
from runtime import read_sealed,sealed_write

class ScheduledTests(unittest.TestCase):
    setUp=fixtures.MentorshipTests.setUp
    tearDown=fixtures.MentorshipTests.tearDown
    def proposal(self,**execution):
        p={k:self.plan['payload'][k] for k in ['reportSha256','selectionSourceSha256','curriculumSha256','basedOn','facts','hypotheses','priorities','difficulty','nextEvaluation','maxRealCycles']}
        stamp=datetime.now(timezone.utc).isoformat()
        p.update(contract='education-proposal-v1',execution={'method':'chatgpt-scheduled','taskId':'ai-education-scheduled-001','runId':'report-'+p['reportSha256'],'scheduledFor':stamp,**execution})
        return {'id':123,'html_url':self.transport['url'],'user':{'login':'isinxnisi'},'created_at':stamp,'updated_at':stamp,
                'body':s.PREFIX+p['reportSha256']+' -->\n```json\n'+json.dumps(p,ensure_ascii=False)+'\n```'}
    def test_self_claim_held_until_operator_attests_real_plan_and_same_pull_idempotent(self):
        row=self.proposal()
        with patch('scheduled_policy.held'),patch('mentorship.held'):
            self.assertEqual(s.receive(self.home,row,'token')['reason'],'schedule-channel-unregistered')
            self.assertFalse((self.home/'mentorship/active.json').exists())
            accepted=s.register(self.home,row,'https://chatgpt.com/c/observed-test-run','ai-education-scheduled-001','token')
            self.assertEqual(accepted['status'],'accepted');self.assertEqual(accepted['executionEvidence']['basis'],'operator-attested-run')
            self.assertEqual(s.receive(self.home,row,'token'),accepted)
            selected=m.selected(self.home,m.generate(),2)[2]
            self.assertEqual(selected['selectedKind'],'evidence');self.assertTrue(selected['holdoutUnchanged']);self.assertFalse(selected['modelExecuted'])
    def test_normalization_stable_and_no_cloud_checksum_uuid_required(self):
        row=self.proposal();value,_,_=s.normalized(row)
        self.assertEqual(s.normalized(row)[0],value);self.assertEqual(m.checked(value)['method'],'chatgpt-scheduled')
        self.assertNotIn('planId',s.parse(row['body']));self.assertNotIn('sha256',s.parse(row['body']))
    def test_untrusted_edited_future_and_extra_fields_rejected(self):
        rows=[];row=self.proposal();row['user']['login']='other';rows.append(row)
        row=self.proposal();row['updated_at']='2020-01-01T00:00:00Z';rows.append(row)
        rows.append(self.proposal(scheduledFor=(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()))
        row=self.proposal();p=s.parse(row['body']);p['command']='do something';row['body']=s.PREFIX+p['reportSha256']+' -->\n```json\n'+json.dumps(p)+'\n```';rows.append(row)
        for row in rows:
            with self.assertRaises(ValueError):s.normalized(row)
    def test_method_cannot_be_blessed_by_changing_only_transport_or_run_id(self):
        row=self.proposal()
        with patch('scheduled_policy.held'),patch('mentorship.held'):
            s.register(self.home,row,'https://chatgpt.com/c/observed-test-run','ai-education-scheduled-001','token')
            other=copy.deepcopy(row);other['id']=124;other['html_url']=self.transport['url'].replace('123','124')
            with self.assertRaisesRegex(ValueError,'scheduled_run_conflict'):s.receive(self.home,other,'token')
            other=self.proposal(taskId='unregistered-task')
            with self.assertRaisesRegex(ValueError,'schedule_task_mismatch'):s.receive(self.home,other,'token')
    def test_next_proposal_keeps_registered_channel_claim_separate_from_attested_run(self):
        row=self.proposal()
        with patch('scheduled_policy.held'),patch('mentorship.held'):
            s.register(self.home,row,'https://chatgpt.com/c/observed-test-run','ai-education-scheduled-001','token')
            other=self.proposal(runId='another-run-id');other['id']=124;other['html_url']=self.transport['url'].replace('123','124')
            decision=s.receive(self.home,other,'token')
            self.assertEqual(decision['status'],'rejected');self.assertEqual(decision['reason'],'report_already_planned')
            self.assertEqual(decision['executionEvidence']['basis'],'registered-github-channel')

class MaintenanceTests(unittest.TestCase):
    setUp=fixtures.MentorshipTests.setUp
    tearDown=fixtures.MentorshipTests.tearDown
    def test_paused_does_not_touch_github_or_take_nested_guard(self):
        a.init(self.home)
        with patch('autonomy.subprocess.run',side_effect=AssertionError('no guard')):
            self.assertEqual(a.tick(self.home)['reason'],'paused')
    def test_outside_cpu_window_uses_common_guard_for_exchange_only_and_honors_hourly_budget(self):
        c=a.init(self.home);c['enabled']=True;a.atomic(self.home/'config.json',c)
        with patch('autonomy.due',return_value='outside-window'),patch('autonomy.subprocess.run',return_value=SimpleNamespace(returncode=75)) as command:
            result=a.tick(self.home);self.assertEqual(result['reason'],'common-lock');self.assertEqual(result['operation'],'maintenance')
            self.assertIn('guard',command.call_args.args[0]);self.assertEqual(command.call_args.args[0][-1],'maintenance')
        a.atomic(self.home/'mentorship/maintenance-status.json',{'at':a.now(),'status':'synchronized'})
        with patch('autonomy.due',return_value='outside-window'),patch('autonomy.subprocess.run',side_effect=AssertionError('hourly budget')):
            self.assertEqual(a.tick(self.home)['reason'],'outside-window')
