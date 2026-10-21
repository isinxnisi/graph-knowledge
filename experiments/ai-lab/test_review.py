import copy
import unittest
from unittest.mock import patch
from core import HERE, candidates, file_hash, load_snapshot, read_json
from review import markdown, packet


class ReviewTests(unittest.TestCase):
    def test_every_candidate_and_support_is_visible_without_approval(self):
        before=file_hash(HERE/'evaluation/development-labels.json')
        value=packet();text=markdown(value)
        self.assertFalse(value['approvalRecorded'])
        self.assertEqual(len(value['rows']),4)
        data,_=load_snapshot()
        for row in value['rows']:
            self.assertEqual(row['reviewStatus'],'pending-human')
            self.assertEqual(row['candidates'],candidates(data,row['task']))
            for candidate in row['candidates']['items']:
                self.assertIn(candidate['id'],text)
                for step in candidate['path']:
                    self.assertIn(step['claimId'],text)
                    for cid in step['citationIds']:
                        self.assertIn(cid,text)
        self.assertEqual(file_hash(HERE/'evaluation/development-labels.json'),before)

    def test_changed_task_hash_rejected(self):
        labels=copy.deepcopy(read_json(HERE/'evaluation/development-labels.json'))
        labels['tasks']['pluto-supervisor']['taskSha256']='0'*64
        real=read_json
        with patch('review.read_json',side_effect=lambda p:labels if p.name=='development-labels.json' else real(p)):
            with self.assertRaisesRegex(ValueError,'review_task_changed'):packet()

    def test_approved_or_unknown_answer_is_not_silently_published_as_a_draft(self):
        for field,value in [('reviewStatus','approved'),('acceptable',['invented-path'])]:
            labels=copy.deepcopy(read_json(HERE/'evaluation/development-labels.json'))
            labels['tasks']['pluto-supervisor'][field]=value
            real=read_json
            with patch('review.read_json',side_effect=lambda p:labels if p.name=='development-labels.json' else real(p)):
                with self.assertRaises(ValueError):packet()


if __name__=='__main__':unittest.main()
