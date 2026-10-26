import copy
from datetime import datetime,timedelta
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import patch
import autonomy as a
from curriculum import generate,validate_splits
from gpu_trial import PROFILE
from runtime import resource_gate,sealed_write
from sandbox import experiment,run_stage
from test_lab import safe

class AutonomyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.home=Path(self.temp.name);self.config=a.init(self.home)
    def tearDown(self):self.temp.cleanup()
    def test_default_paused_window_budget_and_cooldown(self):
        at=datetime(2026,10,27,21,0,tzinfo=a.JST);c=self.config
        self.assertEqual(a.due(c,[],at),'paused');c['enabled']=True
        self.assertEqual(a.due(c,[],at.replace(hour=2)),'outside-window')
        rows=[{'mode':'real','startedAt':at.isoformat()}]
        self.assertEqual(a.due(c,rows,at),'daily-budget');c['dailyMax']=2
        self.assertEqual(a.due(c,rows,at+timedelta(minutes=10)),'cooldown')
        self.assertIsNone(a.due(c,rows,at+timedelta(minutes=61)))
    def test_window_spikes_allowed_but_sustained_and_rising_heat_rejected(self):
        obs=safe();obs['gpu'].update(temperatureC=76,freeMiB=1600)
        obs['window']=[copy.deepcopy(obs) for _ in range(6)]
        obs['window'][2]['gpu']['utilizationPercent']=99
        self.assertIsNone(resource_gate(obs,PROFILE));self.assertEqual(resource_gate(obs),'gpu_too_warm')
        for row in obs['window'][:4]:row['gpu']['utilizationPercent']=30
        self.assertEqual(resource_gate(obs,PROFILE),'gpu_busy')
        for row in obs['window']:row['gpu']['utilizationPercent']=0
        obs['window'][0]['gpu']['temperatureC']=74
        self.assertEqual(resource_gate(obs,PROFILE),'gpu_too_warm')
        obs['gpu']['temperatureC']=77;self.assertEqual(resource_gate(obs,PROFILE),'gpu_too_warm')
    def test_curriculum_is_disjoint_and_pending_semantics_not_teacher_labels(self):
        data=generate();self.assertEqual(len(data['tasks']),16);validate_splits(data['tasks'])
        self.assertEqual({t['kind'] for t in data['tasks']},{'direction','evidence','polarity','role','scope','period','purpose'})
        for t in data['tasks']:
            self.assertNotIn('expectedChoice',t['request'])
            if t['kind']=='purpose':self.assertIsNone(t['expectedChoice']);self.assertEqual(t['evaluationBasis'],'pending-human')
        invalid=copy.deepcopy(data['tasks']);invalid[0]['split']='holdout';invalid.append({**data['tasks'][0],'split':'train'})
        with self.assertRaisesRegex(ValueError,'train_holdout_leakage'):validate_splits(invalid)
    def test_two_dry_runs_do_not_compute_and_completed_cycle_is_idempotent(self):
        with patch('autonomy.held'),patch('autonomy.kg_check',side_effect=AssertionError('no KG call')),patch('autonomy.experiment',side_effect=AssertionError('no compute')):
            for _ in range(2):
                id=str(uuid.uuid4());r=a.run_cycle(self.home,id,'test',dry=True)
                self.assertEqual(r['status'],'prepared');self.assertEqual(a.run_cycle(self.home,id,'test',dry=True),r)
    def test_unfinished_cycle_blocks_new_uuid_and_tick(self):
        id=str(uuid.uuid4());sealed_write(self.home/'cycles'/id/'intent.json',{'mode':'real','startedAt':a.now()})
        with patch('autonomy.held'),patch('autonomy.experiment',side_effect=AssertionError('no retry')):
            with self.assertRaisesRegex(ValueError,'unfinished_cycle_requires_reconciliation'):a.run_cycle(self.home,str(uuid.uuid4()),'test')
        self.assertEqual(a.tick(self.home)['reason'],'unfinished-cycle')
    def test_stop_before_container_and_repeated_experiment_no_dispatch(self):
        stop=self.home/'stop';stop.touch()
        with patch('sandbox.held'),patch('sandbox.subprocess.Popen',side_effect=AssertionError('no container')):
            with self.assertRaisesRegex(ValueError,'operator_stop'):run_stage(self.home,'train','test',stop_file=stop)
            request={'test':True};id=str(uuid.uuid4())
            from core import digest
            sealed_write(self.home/'experiments'/id/'result.json',{'inputSha256':digest(request),'status':'completed'})
            self.assertEqual(experiment(self.home,id,request,'test')['status'],'completed')
    def test_strict_configuration_and_explicit_code_refresh(self):
        c=self.config;c['dailyMax']=True;a.atomic(self.home/'config.json',c)
        with self.assertRaisesRegex(ValueError,'budget'):a.configuration(self.home)

if __name__=='__main__':unittest.main()
