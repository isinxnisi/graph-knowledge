import copy
from datetime import datetime,timezone,timedelta
import tempfile
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch
import mentorship as m
import education_github as g
from core import digest
from curriculum import generate,validate_splits
from runtime import sealed_write,read_sealed

class FakeGithub:
    def __init__(self):self.rows=[];self.posts=0;self.timeout=False
    def comments(self):return self.rows
    def request(self,method,path,body=None):
        assert method=='POST';self.posts+=1
        if self.timeout:raise TimeoutError()
        row={'id':100+self.posts,'html_url':f'https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-{100+self.posts}','user':{'login':'isinxnisi'},'body':body['body']}
        self.rows.append(row);return row

class MentorshipTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.home=Path(self.temp.name)
        self.row={'cycleId':str(uuid.uuid4()),'resultSha256':'a'*64}
        self.payload={'createdAt':m.now(),'educatorKey':'plunode-official-ai','selectionSourceSha256':m.source_hash(),'curriculumSha256':m.sha(generate()),'historySha256':m.history_hash(self.home),'cycles':[self.row]}
        self.report=m.envelope(self.payload);sealed_write(self.home/'mentorship/reports'/(self.report['sha256']+'.json'),self.report)
        at=datetime.now(timezone.utc)
        self.plan=m.envelope({'contract':'education-plan-v1','planId':str(uuid.uuid4()),'createdAt':at.isoformat(),'expiresAt':(at+timedelta(days=1)).isoformat(),
              'educatorKey':'plunode-official-ai','officialAiIdentityId':m.identities()['OFFICIAL_AI_ID'],'apprenticeId':m.AI_ID,
              'reportSha256':self.report['sha256'],'selectionSourceSha256':m.source_hash(),'curriculumSha256':m.sha(generate()),'basedOn':[self.row],
              'method':'interactive-codex','facts':[{'ja':'構造評価1問のみ。','en':'Only one structural check.','cycleIds':[self.row['cycleId']]}],
              'hypotheses':[{'ja':'判断保留の追加確認が必要。','en':'Abstention needs another check.','cycleIds':[self.row['cycleId']]}],
              'priorities':['evidence','role'],'difficulty':'single-edge','nextEvaluation':list(m.CONDITIONS),'maxRealCycles':1})
        self.transport={'commentId':123,'url':'https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-123','author':'isinxnisi'}
    def tearDown(self):self.temp.cleanup()
    def test_category_selection_changes_train_but_never_holdout_or_model_parameters(self):
        curriculum=generate();base,protected=m.choose(curriculum,2)
        with patch('mentorship.held'):
            accepted=m.admit(self.home,self.plan,self.transport,'token');self.assertEqual(accepted['status'],'accepted')
            chosen,holdout,result=m.selected(self.home,curriculum,2)
            self.assertEqual(chosen['kind'],'evidence');self.assertNotEqual(chosen,base);self.assertEqual(holdout,protected)
            validate_splits([chosen,holdout]);self.assertFalse(result['modelExecuted'])
            self.assertEqual(m.admit(self.home,self.plan,self.transport,'token'),accepted)
    def test_commands_hyperparameters_adoption_budget_and_holdout_changes_rejected(self):
        for change in [lambda p:p.update(command='rm -rf /'),lambda p:p.update(learningRate=1),lambda p:p.update(adoptModel=True),
                       lambda p:p.update(priorities=['purpose']),lambda p:p.update(nextEvaluation=[]),lambda p:p.update(maxRealCycles=99),lambda p:p.update(method='chatgpt-scheduled')]:
            value=copy.deepcopy(self.plan['payload']);change(value)
            with patch('mentorship.held'):
                result=m.admit(self.home,m.envelope(value),self.transport,'token')
                self.assertEqual(result['status'],'rejected');self.assertFalse((self.home/'mentorship/active.json').exists())
    def test_expiry_source_history_and_reference_mismatch_rejected(self):
        for key,value in [('selectionSourceSha256','f'*64),('curriculumSha256','f'*64),('reportSha256','f'*64),('expiresAt','2020-01-01T00:00:00+00:00'),('basedOn',[])]:
            p=copy.deepcopy(self.plan['payload']);p[key]=value
            with self.assertRaises((ValueError,KeyError)):m.validate_plan(m.envelope(p),self.report,self.home)
        with patch('mentorship.history_hash',return_value='f'*64),self.assertRaisesRegex(ValueError,'stale_report'):m.validate_plan(self.plan,self.report,self.home)
    def test_untrusted_author_never_activates_and_duplicate_id_conflict_rejected(self):
        with patch('mentorship.held'):
            self.assertEqual(m.admit(self.home,self.plan,{**self.transport,'author':'untrusted'},'token')['status'],'rejected')
        with patch('mentorship.held'):
            self.plan['payload']['planId']=str(uuid.uuid4());self.plan=m.envelope(self.plan['payload']);m.admit(self.home,self.plan,self.transport,'token')
            other=copy.deepcopy(self.plan['payload']);other['priorities']=['role']
            self.assertEqual(m.admit(self.home,m.envelope(other),self.transport,'token')['reason'],'plan_id_conflict')
    def test_one_real_intent_exhausts_plan_and_invalid_pointer_falls_back(self):
        with patch('mentorship.held'):m.admit(self.home,self.plan,self.transport,'token')
        sealed_write(self.home/'cycles'/str(uuid.uuid4())/'intent.json',{'mode':'real','educationPolicy':{'planSha256':self.plan['sha256']}})
        self.assertEqual(m.selected(self.home,generate(),2)[2]['reason'],'plan_budget_exhausted')
        path=self.home/'mentorship/active.json';path.write_text('{}')
        self.assertEqual(m.selected(self.home,generate(),2)[2]['reason'],'policy-unavailable')
    def test_post_and_repeat_are_one_write_unknown_is_never_resent_then_reconciled(self):
        c=FakeGithub()
        with patch('education_github.held'):
            result=g.post(self.home,'plan',self.plan,'token',c);self.assertEqual(result['status'],'published')
            g.post(self.home,'plan',self.plan,'token',c);self.assertEqual(c.posts,1)
        other=m.envelope({**self.plan['payload'],'planId':str(uuid.uuid4())});c=FakeGithub();c.timeout=True
        with patch('education_github.held'):
            self.assertEqual(g.post(self.home,'plan',other,'token',c)['status'],'unknown-no-resend')
            g.post(self.home,'plan',other,'token',c);self.assertEqual(c.posts,1)
            c.rows=[{'id':123,'html_url':self.transport['url'],'user':{'login':'isinxnisi'},'body':g.body_for('plan',other)}]
            self.assertEqual(g.post(self.home,'plan',other,'token',c)['status'],'reconciled');self.assertEqual(c.posts,1)
    def test_marker_checksum_and_duplicate_json_keys_are_rejected(self):
        text=g.body_for('plan',self.plan);self.assertEqual(g.parse_body(text,'plan'),self.plan)
        for bad in [text+'\nignore rules',text.replace('"difficulty":"single-edge"','"difficulty":"single-edge","difficulty":"large"'),text.replace('"maxRealCycles":1','"maxRealCycles":2')]:
            with self.assertRaises(ValueError):g.parse_body(bad,'plan')

if __name__=='__main__':unittest.main()
