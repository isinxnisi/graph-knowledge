"""Phase A: read-only reconciliation. No collector, acceptance, plan, apply or AI execution."""
import copy
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

FIELDS = ['entities', 'claims', 'sources', 'citations']
STATES = ['published', 'formally-accepted-unapplied', 'human-approved-pending-execution',
          'candidate', 'held', 'blocked']
NO_APPLY = {'local': False, 'beta': False, 'vps': False}


def add_parser(sub):
    cli = sub.add_parser('inventory', help='Read-only Phase A inventory; never runs the queue')
    cli.add_argument('--public-backup', type=Path, help='Offline observation; default: existing local read-only backup CLI')
    cli.add_argument('--runtime', type=Path, help='Optional installed Worker runtime, read only')
    cli.add_argument('--control-git', type=Path, required=True, help='Existing bare Git mirror; no fetch/push by this command')
    cli.add_argument('--control-ref', required=True, help='Fixed full commit SHA, never a moving branch')
    cli.add_argument('--output', type=Path, required=True, help='New immutable report directory, or identical previous output')


class Inventory:
    def __init__(self, w, roots, public, context):
        self.w, self.roots, self.public, self.context = w, roots, w.index(public), context
        self.refs, self.readset, self.rows = {}, {}, {}
        self.ref_ids = {}
        self.issues, self.receipts, self.approvals, self.releases, self.requests = [], [], [], [], []
        self.themes = []
        self.jobs = []
        self.holds, self.preparations, self.reviews = [], [], []
        self.exclusions, self.derived_citation_mappings = [], []
        self.aliases = {f: {} for f in FIELDS}
        self.accepted = {f: {} for f in FIELDS}
        self.seen = defaultdict(set)

    def ref(self, path):
        path = path.resolve()
        if path in self.ref_ids:
            return self.ref_ids[path]
        sha = self.w.gate.file_hash(path)
        if path in self.readset:
            self.w.require(self.readset[path] == sha, 'Input changed during inventory: ' + str(path))
        self.readset[path] = sha
        for label, root in self.roots:
            if path.is_relative_to(root):
                file = label + '/' + path.relative_to(root).as_posix()
                break
        else:
            file = str(path)
        if path == self.context.get('backupPath'):
            file = 'public-observation/public.json'
        ident = self.w.digest([file, sha])[:20]
        self.refs[ident] = {'file': file, 'sha256': sha}
        self.ref_ids[path] = ident
        return ident

    def read(self, path):
        self.ref(path)
        return self.w.read(path)

    def problem(self, kind, path, error):
        row = {'kind': kind, 'reference': self.ref(path), 'reason': str(error)}
        if row not in self.issues:
            self.issues.append(row)

    def resolve(self, reference, preferred=None):
        file = Path(reference['file'])
        self.w.require(not file.is_absolute() and '..' not in file.parts, 'Unsafe reference path')
        candidates = ([preferred] if preferred else []) + [r for _, r in self.roots]
        for root in candidates:
            path = root / file
            if path.is_file() and self.w.gate.file_hash(path) == reference['sha256']:
                self.ref(path)
                return path
        raise ValueError('Missing or changed reference: ' + str(file) + ' @ ' + reference['sha256'])

    def existing(self, file, preferred):
        for root in [preferred] + [r for _, r in self.roots]:
            path = root / file
            if path.is_file():
                return path
        raise ValueError('Missing comparison artifact: ' + file)

    def paths(self, pattern):
        return [(root, p) for _, root in self.roots for p in sorted(root.glob(pattern))]

    def once(self, category, path):
        sha = self.refs[self.ref(path)]['sha256']
        if sha in self.seen[category]:
            return False
        self.seen[category].add(sha)
        return True

    def canonical(self, field, ident):
        visited = set()
        while ident in self.aliases[field]:
            self.w.require(ident not in visited, 'Cyclic accepted UUID mapping')
            visited.add(ident)
            ident = self.aliases[field][ident]
        return ident

    def add(self, field, record, path, stage, proof=None):
        ident = self.canonical(field, record['id'])
        key = field + ':' + ident
        row = self.rows.setdefault(key, {'type': field, 'id': ident, 'versions': {}, 'observations': [],
                                         'acceptances': [], 'approvals': [], 'releases': [], 'holds': []})
        sha = self.w.digest(record)
        row['versions'][sha] = record
        obs = {'reference': self.ref(path), 'recordId': record['id'], 'recordSha256': sha, 'stage': stage}
        if obs not in row['observations']:
            row['observations'].append(obs)
        if proof and proof not in row[stage]:
            row[stage].append(proof)
        return row

    def formal_receipts(self):
        # Validate each receipt independently. A missing cumulative release must not hide a saved receipt.
        for root, path in self.paths('datasets/manga-collection/accepted-*/acceptance.json'):
            if not self.once('receipts', path):
                continue
            previous_aliases = copy.deepcopy(self.aliases)
            try:
                receipt = self.read(path)
                self.w.require(receipt['status'] == 'accepted-for-release-preparation-only'
                               and receipt['reviewer'] and receipt['recordedAt'], 'Explicit formal receipt required')
                self.w.require(receipt['applyAuthorized'] == NO_APPLY, 'Unsupported receipt authorization')
                proposals = []
                for ref in receipt['referenceArtifacts']:
                    source = self.resolve(ref, root)
                    if source.suffix == '.json':
                        value = self.read(source)
                        if isinstance(value, dict) and isinstance(value.get('records'), dict):
                            proposals.append(value['records'])
                immutable = path.with_name('acceptance-manifest.json')
                if immutable.exists():
                    for file, sha in self.read(immutable)['artifacts'].items():
                        self.resolve({'file': file, 'sha256': sha}, path.parent)
                selected = {f: {} for f in FIELDS}
                for field in FIELDS:
                    ids = receipt['acceptedRecordIds'][field]
                    self.w.require(len(ids) == len(set(ids)), 'Duplicate accepted UUID')
                    for ident in ids:
                        choices = [copy.deepcopy(r) for p in proposals for r in p.get(field, []) if r['id'] == ident]
                        if field == 'claims':
                            scopes = [s for s in receipt['scopeByClaim'] if s['id'] == ident]
                            self.w.require(len(scopes) == 1, 'Accepted Claim scope missing/duplicated')
                            choices = [r for r in choices if all(r.get(k) == v for k, v in scopes[0].items())]
                            for r in choices:
                                r['visibility'] = 'published'
                        for r in choices:
                            for prop, id_key in [('sourceEditorialChanges', 'sourceId'), ('citationEditorialChanges', 'citationId')]:
                                for edit in receipt.get(prop, []):
                                    if edit[id_key] == ident:
                                        self.w.require(r['note'] == edit['beforeNote'], 'Editorial origin differs')
                                        r['note'] = edit['afterNote']
                        self.w.require(choices and len({self.w.digest(r) for r in choices}) == 1,
                                       'No unique hash-backed accepted record: ' + ident)
                        record = choices[0]
                        self.w.require(ident not in self.accepted[field] or self.accepted[field][ident] == record,
                                       'Conflicting formal receipts: ' + ident)
                        selected[field][ident] = record
                # Only verified, explicitly recorded identity mappings collapse UUIDs.
                mappings = [('entities', 'entityMappings', 'sourceEntityId', 'existingEntityId'),
                            ('claims', 'claimIdMappings', 'sourceClaimId', 'proposedClaimId')]
                for field, prop, before, after in mappings:
                    for mapping in receipt.get(prop, []):
                        target = mapping[after]
                        self.w.require(target in selected[field] or target in self.public[field]
                                       or target in self.accepted[field], 'Mapping target lacks accepted/public record')
                        old = self.aliases[field].get(mapping[before], target)
                        self.w.require(old == target, 'Conflicting accepted UUID mappings')
                        self.aliases[field][mapping[before]] = target
                for field in FIELDS:
                    for ident in self.aliases[field]:
                        self.canonical(field, ident)  # Reject cycles before storing any formal records.
                ref_id = self.ref(path)
                for field in FIELDS:
                    self.accepted[field].update(selected[field])
                    for record in selected[field].values():
                        self.add(field, record, path, 'acceptances', ref_id)
                self.receipts.append({'reference': ref_id, 'decisionId': receipt.get('decisionId', path.parent.name),
                    'recordedAt': receipt['recordedAt'], 'sourceJobId': receipt.get('sourceJobId'),
                    'counts': {f: len(selected[f]) for f in FIELDS}, 'remainingHolds': receipt.get('remainingHolds', [])})
                self.exclusions += [{'id': ident, 'reference': ref_id, 'reasons': ['excluded-from-this-formal-acceptance']}
                                    for ident in receipt.get('excludedEntityIds', [])]
            except (ValueError, OSError, KeyError, TypeError) as error:
                self.aliases = previous_aliases
                self.problem('invalid-formal-receipt', path, error)

    def release_candidates(self):
        for root, path in self.paths('datasets/public-kg/releases/*/manifest.json'):
            manifest = self.read(path)
            if not manifest.get('baseRelease') or not self.once('releases', path):
                continue
            data_path = path.with_name('data.json')
            try:
                self.w.require(self.w.gate.file_hash(data_path) == manifest['dataSha256'], 'Release checksum differs')
                fixture = self.w.index(self.read(data_path))
                base = self.w.index(self.read(self.existing('datasets/public-kg/releases/' + manifest['baseRelease'] + '/data.json', root)))
                extra = {f: {k: v for k, v in fixture[f].items() if k not in base[f]} for f in FIELDS}
                if not any(k in self.accepted[f] for f in FIELDS for k in extra[f]):
                    continue  # Historical public releases are already represented by the observed snapshot.
                self.w.require(all(all(fixture[f].get(k) == v for k, v in base[f].items()) for f in FIELDS),
                               'Prepared release changed its historical base')
                self.w.require(all(all(self.accepted[f].get(k) == v for k, v in extra[f].items()) for f in FIELDS),
                               'Release has unaccepted or changed additions')
                ref_id = self.ref(path)
                for f in FIELDS:
                    for record in extra[f].values():
                        self.add(f, record, data_path, 'releases', ref_id)
                self.releases.append({'release': manifest['release'], 'reference': ref_id,
                    'baseRelease': manifest['baseRelease'], 'counts': {f: len(extra[f]) for f in FIELDS},
                    'state': 'release-prepared', 'validation': 'checksum-base-and-receipt-content-verified',
                    'freshPlanVerified': False})
            except (ValueError, OSError, KeyError, TypeError) as error:
                self.problem('invalid-release-candidate', path, error)

    def candidates(self):
        patterns = ['datasets/manga-collection/*/proposed-records.json',
                    'datasets/manga-collection/*/candidate-records.json',
                    'datasets/manga-collection/original-story-*/candidates.json',
                    'datasets/manga-collection/workflow-reviews/*/proposed-records.json',
                    'datasets/manga-collection/workflow-reviews/*/identity-only-records.json']
        for pattern in patterns:
            for _, path in self.paths(pattern):
                data = self.read(path)
                for field, records in data.get('records', {}).items():
                    if field in FIELDS:
                        for record in records:
                            self.add(field, record, path, 'candidate')
        for root, path in self.paths('.local/collection-jobs/*/artifacts/candidate/data.json'):
            if not self.once('raw-candidates', path):
                continue
            try:
                job_dir = path.parents[2]
                job = self.read(job_dir / 'job.json')
                self.jobs.append({'id': job['jobId'], 'status': job['status'], 'reference': self.ref(job_dir / 'job.json')})
                if job['status'] != 'candidate-ready':
                    continue  # Retain failure history; partial output is not a completed candidate inventory.
                self.w.gate.verify_result(job_dir, job)
                self.ref(job_dir / 'work-order.json')
                for file in job['artifacts']:
                    self.ref(job_dir / 'artifacts' / file)
                order = job['workOrder']
                self.w.require(order['definitionSha256'] == self.w.digest(order['theme'])
                               and order['approvalSha256'] == self.w.digest(order['approval'])
                               and order['approval']['definitionSha256'] == order['definitionSha256'], 'Frozen job approval packet differs')
                for ref in order['theme']['execution']['inputs']:
                    self.resolve(ref, root)
                manifest = self.read(path.with_name('manifest.json'))
                self.w.require(self.w.gate.file_hash(path) == manifest['dataSha256'], 'Candidate checksum differs')
                data = self.read(path)
                base = self.read(self.existing('datasets/public-kg/releases/' + manifest['baseRelease'] + '/data.json', root))
                old = self.w.index(base)
                for f in FIELDS:
                    for record in data[f]:
                        if record['id'] not in old[f]:
                            self.add(f, record, path, 'raw-candidate')
            except (ValueError, OSError, KeyError, TypeError) as error:
                self.problem('incomplete-candidate', path, error)

        # A verified Claim UUID mapping changes Citation UUID in the old reviewed projection.
        # Fold only when every other Citation field is byte-value identical after that mapping.
        # Preserve both original bodies/hashes and the proof; this never changes a saved record.
        for key, row in list(self.rows.items()):
            if row['type'] != 'citations' or row['acceptances']:
                continue
            for raw in row['versions'].values():
                mapped = self.canonical('claims', raw['claimId'])
                if mapped == raw['claimId']:
                    continue
                normalized = {**raw, 'claimId': mapped}
                matches = [r for r in self.accepted['citations'].values()
                           if {k: v for k, v in r.items() if k != 'id'} == {k: v for k, v in normalized.items() if k != 'id'}]
                if len(matches) != 1:
                    continue
                ident = matches[0]['id']
                target = self.rows['citations:' + ident]
                target['versions'].update(row['versions'])
                target['observations'] += row['observations']
                self.aliases['citations'][row['id']] = ident
                self.derived_citation_mappings.append({'sourceCitationId': row['id'], 'acceptedCitationId': ident,
                    'sourceClaimId': raw['claimId'], 'acceptedClaimId': mapped,
                    'basis': 'formal-claim-mapping-and-identical-all-other-citation-fields',
                    'acceptanceReferences': target['acceptances']})
                del self.rows[key]
                break

        for exclusion in self.exclusions:
            row = self.rows.get('entities:' + self.canonical('entities', exclusion['id']))
            if row:
                row['holds'].append(exclusion)

        for _, path in self.paths('datasets/manga-collection/review-*/review.json'):
            if not self.once('legacy-review', path):
                continue
            review = self.read(path)
            for h in review.get('holds', []) + review.get('inheritedHolds', []):
                self.holds.append({'reference': self.ref(path), 'kind': 'historical-collection-hold', 'detail': h})

        for _, path in self.paths('datasets/manga-collection/workflow-reviews/*/review-manifest.json'):
            if not self.once('review', path):
                continue
            try:
                manifest = self.read(path)
                for file, sha in manifest['artifacts'].items():
                    self.resolve({'file': file, 'sha256': sha}, path.parent)
                context = self.read(path.with_name('context.json'))
                self.w.require(self.w.digest(context) == manifest['inputSha256'], 'Review context hash differs')
                review = self.read(path.with_name('review.json'))
                ref_id = self.ref(path)
                self.reviews.append({'reference': ref_id, 'jobId': context['jobId'], 'public': context['public'],
                    'acceptedReferences': context['acceptedReferences']})
                for f, key in [('entities', 'entityId'), ('claims', 'claimId')]:
                    for r in review[f]:
                        row = self.rows.get(f + ':' + self.canonical(f, r[key]))
                        if row:
                            item = {'reference': ref_id, **r}
                            row.setdefault('reviews', []).append(item)
                            if r['status'] == 'held':
                                row['holds'].append(item)
                for held in review.get('inheritedHolds', []):
                    item = {'reference': ref_id, 'kind': 'unstructured-collection-hold', 'detail': held}
                    if item not in self.holds:
                        self.holds.append(item)
            except (ValueError, OSError, KeyError, TypeError) as error:
                self.problem('invalid-review', path, error)

    def decision(self, decision, root, path, approval_id):
        self.w.require(decision['status'] == 'approved' and decision['approvalScope'] ==
                       'formal-record-acceptance-and-release-preparation-only' and decision['applyAuthorized'] == NO_APPLY,
                       'Explicit formal approval required')
        human = decision['humanDecision']
        decided = datetime.fromisoformat(human['decidedAt'].replace('Z', '+00:00'))
        self.w.require(human['actorType'] == 'human' and human['reviewer'] and human['statement']
                       and decided.tzinfo is not None and decided <= datetime.now(timezone.utc), 'Explicit human decision required')
        review_path = self.resolve(decision['review'], root)
        for ref in decision['referenceArtifacts']:
            self.resolve(ref, root)
        manifest = self.read(review_path)
        self.w.require(manifest.get('schemaVersion') == 1 and manifest.get('authority') == 'pending-human-review-only',
                       'Unsupported approval review format')
        self.w.require(self.w.gate.inventory(review_path.parent) == {**manifest['artifacts'],
                       'review-manifest.json': self.w.gate.file_hash(review_path)}, 'Approved review inventory differs')
        expected_refs = [{'file': str(Path(decision['review']['file']).parent / file), 'sha256': sha}
                         for file, sha in sorted({**manifest['artifacts'], 'review-manifest.json':
                             self.w.gate.file_hash(review_path)}.items())]
        self.w.require(decision['referenceArtifacts'] == expected_refs, 'Approved evidence inventory differs')
        for file, sha in manifest['artifacts'].items():
            self.resolve({'file': file, 'sha256': sha}, review_path.parent)
        context = self.read(review_path.with_name('context.json'))
        self.w.require(self.w.digest(context) == manifest['inputSha256'], 'Approved review context differs')
        self.w.require(decision['baseRelease'] == context['public']['release']
                       and decision['baseRevision'] == context['public']['revision'], 'Approved comparison base differs')
        request = self.read(review_path.with_name('decision-request.json'))
        self.w.require(request['status'] == 'pending-human-decision'
                       and not self.read(review_path.with_name('review.json'))['recordConflicts'], 'Unresolved approval review conflict')
        held = {'entities': set(request['heldEntityIds']), 'claims': set(request['heldClaimIds'])}
        records = {f: {} for f in FIELDS}
        for name in ['proposed-records.json', 'identity-only-records.json']:
            for f, rows in self.read(review_path.with_name(name))['records'].items():
                records[f].update({r['id']: r for r in rows})
        selected = []
        self.w.require(set(decision['acceptedRecordIds']) == set(FIELDS) and set(decision['recordSha256']) == set(FIELDS),
                       'Explicit approved IDs and hashes required for all four types')
        for f in FIELDS:
            ids = decision['acceptedRecordIds'][f]
            self.w.require(len(ids) == len(set(ids)), 'Duplicate approved UUID')
            eligible = {ident for g in request['groups'].values() for ident in g['recordIds'][f]}
            self.w.require(set(ids) <= eligible and set(decision['recordSha256'][f]) == set(ids), 'Approved inventory differs')
            for ident in ids:
                self.w.require(ident not in held.get(f, set()), 'Held UUID cannot be approved through this workflow')
                record = records[f][ident]
                self.w.require(self.w.digest(record) == decision['recordSha256'][f][ident], 'Approved body hash differs')
                if f == 'claims':
                    scopes = [r for r in decision['scopeByClaim'] if r['id'] == ident]
                    self.w.require(len(scopes) == 1 and scopes[0] == {'id': ident, **self.w.semantic(record)},
                                   'Approved Role/scope differs')
                selected.append((f, record))
        self.w.require(len(decision['scopeByClaim']) == len(decision['acceptedRecordIds']['claims']), 'Approved scope inventory differs')
        proof = {'approvalId': approval_id, 'decisionId': decision['decisionId'], 'reference': self.ref(path),
                 'reviewReference': self.ref(review_path), 'humanDecision': human,
                 'baseRelease': decision['baseRelease'], 'baseRevision': decision['baseRevision']}
        compared = {sha for _, sha in context['acceptedReferences']}
        proof['comparisonAssessment'] = {
            'publicBaseMatchesObservation': (decision['baseRelease'], decision['baseRevision']) ==
                                           (self.context['release'], self.context['revision']),
            'formalReceiptsOutsideComparison': [r['reference'] for r in self.receipts
                                                if self.refs[r['reference']]['sha256'] not in compared],
            'executionAuthorizedByInventory': False}
        for f, record in selected:
            self.add(f, record, path, 'approvals', proof)
        return {f: sorted(r['id'] for field, r in selected if field == f) for f in FIELDS}

    def control(self, control):
        if control is None:
            return
        for path in sorted((control / 'requests').glob('*.json')):
            request = self.read(path)
            status_path = control / 'results' / path.stem / 'status.json'
            status = self.read(status_path) if status_path.exists() else {}
            row = {'id': request['id'], 'kind': request['kind'], 'reference': self.ref(path),
                   'parentRequestId': request.get('parentRequestId'),
                   'recoveryOf': request.get('resumePreparationId') or request.get('recovery', {}).get('predecessorRequestId'),
                   'phase': status.get('phase', 'not-submitted-to-worker'), 'message': status.get('message'),
                   'updatedAt': status.get('updatedAt'), 'targets': request.get('target', {}).get('targets'),
                   'statusReference': self.ref(status_path) if status else None}
            self.requests.append(row)
            if status and status.get('requestSha256') != self.w.gate.file_hash(path):
                self.problem('request-status-hash-mismatch', status_path, 'Received request differs')
            if request['kind'] == 'accept-release':
                try:
                    self.decision(request['decision'], control.parent / 'collection-control/artifacts' / request['parentRequestId'], path, request['id'])
                except (ValueError, OSError, KeyError, TypeError) as error:
                    self.problem('invalid-acceptance-request', path, error)
        for path in sorted((control / 'approval-registers').glob('*.json')):
            register = self.read(path)
            previous = copy.deepcopy(self.rows)
            try:
                self.w.require(register['status'] == 'approved-by-human-pending-sequential-worker-processing'
                               and register['scope'] == 'formal-record-acceptance-and-release-preparation-only'
                               and register['applyAuthorized'] == NO_APPLY, 'Unsupported approval register')
                union = {f: set() for f in FIELDS}
                for batch in register['batchDecisions']:
                    request = batch['envelope']
                    self.w.require(request['decision']['humanDecision'] == register['humanDecision'], 'Register human decision differs')
                    ids = self.decision(request['decision'], control / 'artifacts' / request['parentRequestId'], path, register['approvalId'])
                    for f in FIELDS:
                        union[f].update(ids[f])
                self.w.require(all(sorted(union[f]) == sorted(register['approvedRecordIds'][f]) for f in FIELDS),
                               'Register union differs from approved batch records')
                self.approvals.append({'approvalId': register['approvalId'], 'reference': self.ref(path),
                    'counts': {f: len(union[f]) for f in FIELDS},
                    'batches': [{'decisionId': b['envelope']['id'],
                        'phase': next((r['phase'] for r in self.requests if r['id'] == b['envelope']['id']), 'not-submitted-to-worker')}
                        for b in register['batchDecisions']]})
            except (ValueError, OSError, KeyError, TypeError) as error:
                self.rows = previous
                self.problem('invalid-approval-register', path, error)
        for _, path in self.paths('.local/collection-issues/*/preparation.json'):
            if not self.once('preparation', path):
                continue
            value = self.read(path)
            self.preparations.append({'reference': self.ref(path), 'id': path.parent.name,
                'origin': value['issueOrigin'], 'counts': value['counts'], 'holds': value['holds'],
                'childRequestIds': [r['id'] for r in value['batchRequests']]})
        for row in self.requests:
            row['recoveredBy'] = [r['id'] for r in self.requests if r['recoveryOf'] == row['id']]
        for preparation in self.preparations:
            preparation['supersededBy'] = [r['id'] for r in self.requests if r['recoveryOf'] == preparation['id']]
            preparation['state'] = 'historical-superseded' if preparation['supersededBy'] else 'current-preparation-observation'

    def collection_themes(self):
        for root, path in self.paths('datasets/collection-themes/themes/*/r*.json'):
            if not self.once('theme', path):
                continue
            value = self.read(path)
            approval = root / 'datasets/collection-themes/approvals' / value['id'] / path.name
            state, approval_ref = 'collection-proposal-not-approved', None
            if approval.exists():
                decision = self.read(approval)
                if decision.get('definitionSha256') == self.w.digest(value):
                    state, approval_ref = 'collection-execution-approved-only', self.ref(approval)
                else:
                    self.problem('collection-theme-approval-hash-mismatch', approval, 'Definition hash differs')
            self.themes.append({'id': value['id'], 'revision': value['revision'], 'title': value['title'],
                'reference': self.ref(path), 'definitionSha256': self.w.digest(value), 'state': state,
                'approvalReference': approval_ref, 'execution': value.get('execution'),
                'notice': 'Theme/collection permission is not formal Entity/Claim acceptance; no UUID records added to totals.'})

    def finish(self):
        generators = [self.ref(Path(__file__)), self.ref(self.w.ROOT / 'scripts/collection-workflow.py')]
        for f in FIELDS:
            for record in self.public[f].values():
                # Published membership is proven only by the validated observed backup.
                self.add(f, record, self.context['backupPath'], 'published')
        counts = {s: {f: 0 for f in FIELDS} for s in STATES}
        for key, row in sorted(self.rows.items()):
            f, ident = row['type'], row['id']
            published = self.public[f].get(ident)
            accepted = self.accepted[f].get(ident)
            stages = {o['stage'] for o in row['observations']}
            if published and f == 'claims' and published['visibility'] != 'published':
                state, record = 'held', published
                row['holds'].append({'reasons': ['withdrawn-in-observed-public-snapshot']})
            elif published:
                state, record = 'published', published
            elif accepted:
                state, record = 'formally-accepted-unapplied', accepted
            elif row['approvals']:
                state = 'human-approved-pending-execution'
                approved_hashes = {o['recordSha256'] for o in row['observations'] if o['stage'] == 'approvals'}
                self.w.require(len(approved_hashes) == 1, 'Conflicting human-approved bodies: ' + key)
                record = row['versions'][next(iter(approved_hashes))]
            else:
                state = 'held' if row['holds'] or published else 'candidate'
                record = row['versions'][sorted(row['versions'])[0]]
                normalized = [{k: v for k, v in r.items() if k not in ['createdAt', 'updatedAt', 'visibility']}
                              for r in row['versions'].values()]
                if len({self.w.digest(r) for r in normalized}) > 1:
                    state = 'held'
                    row['holds'].append({'reasons': ['same-uuid-candidate-content-differs']})
            row['state'] = state
            row['preparationState'] = 'release-prepared' if row['releases'] else 'not-release-prepared'
            row['recordSha256'] = self.w.digest(record)
            row['record'] = record
            row['label'] = record.get('name', record.get('title', ident))
            row['aliases'] = sorted(k for k in self.aliases[f] if self.canonical(f, k) == ident)
            row['nextStep'] = {'published': '公開snapshot収録済み', 'formally-accepted-unapplied': '公開判断は別工程。準備済みreleaseと現行baseを照合',
                'human-approved-pending-execution': 'Phase Bで比較集合と承認同一性を検証し逐次処理',
                'candidate': '既存レビューに沿って人間が個別判断', 'held': '同定・意味・scope・根拠を人間が再確認',
                'blocked': '元の停止履歴と復旧依頼を確認。棚卸しから実行しない'}[state]
            counts[state][f] += 1
        # Raw dependencies of held-only claims are held too, but independent approvals/receipts win.
        for row in self.rows.values():
            if row['type'] == 'citations' and row['state'] in ['candidate', 'blocked']:
                claim = self.rows.get('claims:' + self.canonical('claims', row['record']['claimId']))
                if claim and claim['state'] == 'held':
                    counts[row['state']]['citations'] -= 1
                    row['state'], row['nextStep'] = 'held', '参照先Claimの保留理由を確認'
                    counts['held']['citations'] += 1
        for row in self.rows.values():
            if row['type'] == 'sources' and row['state'] in ['candidate', 'blocked']:
                citations = [c for c in self.rows.values() if c['type'] == 'citations' and c['record']['sourceId'] == row['id']]
                if citations and all(c['state'] == 'held' for c in citations):
                    counts[row['state']]['sources'] -= 1
                    row['state'], row['nextStep'] = 'held', '全参照Citationが保留。対応Claimの理由を確認'
                    counts['held']['sources'] += 1
        for row in self.rows.values():
            r = row['record']
            row['dependencies'] = ([{'type': 'entities', 'id': self.canonical('entities', r[k])} for k in ['subjectId', 'objectId']]
                if row['type'] == 'claims' else [{'type': f, 'id': self.canonical(f, r[k])}
                    for f, k in [('claims', 'claimId'), ('sources', 'sourceId')]] if row['type'] == 'citations' else [])
            if row['type'] == 'claims':
                row['supportingCitations'] = sorted(c['id'] for c in self.rows.values() if c['type'] == 'citations'
                    and self.canonical('claims', c['record']['claimId']) == row['id'] and c['record'].get('stance') == 'support')
            missing = [d for d in row['dependencies'] if d['type'] + ':' + d['id'] not in self.rows]
            if missing:
                self.issues.append({'kind': 'missing-record-dependency', 'record': row['id'], 'dependencies': missing})
            # Full variant bodies are retained only for unpublished records; public body is in its release artifact.
            row['versionHashes'] = sorted(row['versions'])
            row.pop('versions')
        for row in self.rows.values():
            if row['state'] == 'published':
                row.pop('record')
        for path, sha in self.readset.items():
            self.w.require(self.w.gate.file_hash(path) == sha, 'Input changed during inventory: ' + str(path))
        context = {k: v for k, v in self.context.items() if k != 'backupPath'}
        grouped_holds = {}
        for hold in self.holds:
            key = self.w.digest(hold['detail'])
            item = grouped_holds.setdefault(key, {'id': 'hold-' + key[:16], 'detail': hold['detail'],
                'state': 'historical-observation-check-current-uuid-state', 'observations': []})
            observation = {k: v for k, v in hold.items() if k != 'detail'}
            if observation not in item['observations']:
                item['observations'].append(observation)
        result = {'schemaVersion': 1, 'authority': 'read-only-inventory-not-an-execution-approval',
            'generatorReferences': generators,
            'public': context, 'statePolicy': {'exclusivePrimaryStates': STATES,
                'precedence': 'published > formal receipt > human approval > held > candidate/blocked',
                'releasePrepared': 'orthogonal facet; never add to primary totals',
                'identity': 'type + UUID; formal receipt mappings, plus identical Citation bodies after that explicit Claim mapping',
                'operationalHistory': 'request IDs remain separate; a blocked historical request does not demote recovered records'},
            'counts': counts, 'releasePreparedCounts': {f: sum(r['type'] == f and bool(r['releases'])
                and r['state'] != 'published' for r in self.rows.values()) for f in FIELDS},
            'records': sorted(self.rows.values(), key=lambda r: (r['type'], r['id'])),
            'receipts': self.receipts, 'approvalRegisters': self.approvals, 'releaseCandidates': self.releases,
            'collectionThemes': self.themes,
            'collectionJobs': self.jobs,
            'requests': self.requests, 'requestPhaseCounts': dict(sorted(Counter(r['phase'] for r in self.requests).items())),
            'derivedCitationMappings': self.derived_citation_mappings,
            'preparations': self.preparations, 'unstructuredHolds': list(grouped_holds.values()), 'reviews': self.reviews,
            'issues': self.issues, 'references': dict(sorted(self.refs.items())),
            'limitations': ['Published scope is the supplied/local KG snapshot; no VPS or member DB access.',
                'Record candidates are from production collection jobs and manga review/receipt formats. Frozen pilot datasets and isolated validation trials are not pending production candidates.',
                'No external provider re-fetch; frozen observations do not certify current source content.',
                'Name/QID/same-meaning collisions are not merged without an explicit accepted UUID mapping.',
                'Unstructured holds and preparation targets lack record UUIDs; counted separately from four record types.',
                'Phase B must refresh the comparison set without rebinding or overwriting human approvals.'],
            'sideEffects': {'collection': False, 'formalAcceptance': False, 'publicApply': False,
                            'publicPlan': False, 'vps': False, 'memberDb': False, 'aiCalls': 0}}
        result['inventorySha256'] = self.w.digest(result)
        return result


def markdown(report):
    def cell(value):
        return str(value if value is not None else '—').replace('|', '\\|').replace('\n', ' ')
    lines = ['# 未公開データの統合棚卸し（Phase A）', '',
        '読み取り専用。収集・正式受入・公開apply・plan・VPS／会員DB変更は実行しない。', '',
        f"公開観測: {report['public']['observedAt']} / {report['public']['observation']}",
        f"比較base: {report['public']['release']} / revision {report['public']['revision']}",
        f"公開fixture hash: `{report['public']['fixtureSha256']}`",
        f"control commit: `{report['public']['controlCommit']}`", '',
        '| 主状態（排他的） | Entity | Claim | Source | Citation |', '|---|---:|---:|---:|---:|']
    for state, counts in report['counts'].items():
        lines.append('| ' + state + ' | ' + ' | '.join(str(counts[f]) for f in FIELDS) + ' |')
    lines += ['', 'release-preparedは正式受入済みの別属性で、上表へ加算しない: ' + str(report['releasePreparedCounts']),
        '', '型＋UUIDで一意。正式receiptの明示対応だけを同一化し、別scope・異なるUUIDを名前で統合しない。',
        '公開全件のUUID・hash・依存はinventory.json、本文は比較releaseのdata.jsonで確認する。',
        '由来referenceは末尾の対応表、承認ID・対象UUID・Role・ISBN・支持Citation／Source・依存はinventory.jsonに保持。',
        '', '## 未公開Claim', '', '| 状態 | UUID | 主体 → 対象 | Role / scope | Citation | 承認／受入 | 保留理由／次の手順 |',
        '|---|---|---|---|---|---|---|']
    lookup = {(r['type'], r['id']): r for r in report['records']}
    def name(ident):
        r = lookup.get(('entities', ident), {})
        return r.get('label', ident)
    for row in report['records']:
        if row['type'] != 'claims' or row['state'] == 'published':
            continue
        r = row['record']; contribution = r.get('contribution') or {}
        scope = contribution.get('scope') or {}
        ids = [p['approvalId'] for p in row['approvals']] + row['acceptances']
        reasons = sorted({reason for h in row['holds'] for reason in h.get('reasons', [])})
        values = [row['state'], row['id'], name(r['subjectId']) + ' → ' + name(r['objectId']),
            (contribution.get('roleId') or r['predicate']) + ' / ' + json.dumps(scope, ensure_ascii=False),
            ', '.join(row.get('supportingCitations', [])), ', '.join(sorted(set(ids))),
            '; '.join(reasons) or row['nextStep']]
        lines.append('| ' + ' | '.join(cell(v) for v in values) + ' |')
    lines += ['', '## 未公開Entity・Source・Citation', '',
              '| 型 | 状態 | UUID | 名称 | 保留理由／次の手順 |', '|---|---|---|---|---|']
    for row in report['records']:
        if row['type'] == 'claims' or row['state'] == 'published':
            continue
        reasons = sorted({reason for h in row['holds'] for reason in h.get('reasons', [])})
        lines.append('| ' + ' | '.join(cell(v) for v in [row['type'], row['state'], row['id'], row['label'],
                     '; '.join(reasons) or row['nextStep']]) + ' |')
    lines += ['', '## 承認registerとキュー', '']
    for approval in report['approvalRegisters']:
        lines += [f"- {approval['approvalId']}: {approval['counts']}"]
        lines += [f"  - {b['decisionId']}: {b['phase']}" for b in approval['batches']]
    lines += ['', '| 依頼ID（履歴を保持） | kind | phase | 理由 |', '|---|---|---|---|']
    for r in report['requests']:
        lines.append('| ' + ' | '.join(cell(r[k]) for k in ['id', 'kind', 'phase', 'message']) + ' |')
    lines += ['', '## 準備段階の保留（UUID件数とは別）', '']
    for p in report['preparations']:
        lines += [f"### {p['id']}", '', p.get('state', '') + ' / ' + str(p['counts']), '']
        lines += ['- ' + cell(h) for h in p['holds']]
    lines += ['', '## 受入記録に残る保留（歴史的な記述。現在状態はUUID欄を優先）', '']
    for receipt in report['receipts']:
        lines += [f"- {receipt['decisionId']}: {receipt['counts']} / reference {receipt['reference']}"]
        lines += ['  - ' + cell(h) for h in receipt['remainingHolds']]
    lines += ['', '## 原責任表示などの未構造化保留', '']
    lines += ['- ' + cell(h) for h in report['unstructuredHolds']]
    lines += ['', '## 収集企画・実行許可（レコード件数へ加算しない）', '',
              '| テーマ | revision | 状態 | reference |', '|---|---:|---|---|']
    for theme in report['collectionThemes']:
        lines.append('| ' + ' | '.join(cell(theme[k]) for k in ['id', 'revision', 'state', 'reference']) + ' |')
    lines += ['', '## 欠落・要確認', '']
    lines += ['- ' + cell(v) for v in report['issues']] or ['検出なし。']
    lines += ['', '## Phase Bへ残す課題', '',
        '- 6グループの逐次受入ごとに比較集合を更新し、元承認UUID・本文hash・Role・scope・根拠hashとの同一性を証明する。',
        '- registerにだけ保存された未投入依頼と、Worker受付済み依頼を区別し、二重処理・競合・停止再開を検証する。',
        '- 過去の保留・失敗と復旧後の有効状態を保持し、未解決同定・書誌・原語表記を自動昇格しない。',
        '- 現行base／revision変化、受入後のrelease／validate／plan失敗は別段階として追跡する。',
        '- 既存03–07／09–12／15–18 JST・10分休憩・55分上限を維持。PC停止中は進まない。', '',
        '## 出典・hash', '', '| reference | ファイル | SHA-256 |', '|---|---|---|']
    for ident, ref in report['references'].items():
        lines.append('| ' + ' | '.join(cell(v) for v in [ident, ref['file'], ref['sha256']]) + ' |')
    lines += ['', f"inventorySha256: `{report['inventorySha256']}`", '']
    return '\n'.join(lines)


def execute(args, w):
    w.require(re.fullmatch(r'[0-9a-f]{40}', args.control_ref), 'Pin a full control commit SHA')
    output = args.output.resolve()
    protected = [w.ROOT / p for p in ['datasets/manga-collection', 'datasets/public-kg', 'datasets/collection-themes', '.local', '.git', 'scripts']]
    if args.runtime:
        protected.append(args.runtime.resolve())
    protected.append(args.control_git.resolve())
    if args.public_backup:
        protected.append(args.public_backup.resolve())
    w.require(not any(output == p or output.is_relative_to(p) or p.is_relative_to(output) for p in protected),
              'Inventory output overlaps protected input')
    with tempfile.TemporaryDirectory(prefix='collection-inventory-') as temporary:
        tmp = Path(temporary)
        # Export a fixed Git tree to private scratch. Never checkout, fetch, publish or run Worker.
        command = ['git', '--git-dir=' + str(args.control_git.resolve())]
        sha = subprocess.check_output(command + ['rev-parse', args.control_ref + '^{commit}'], text=True).strip()
        w.require(sha == args.control_ref, 'Control commit differs')
        archive = subprocess.check_output(command + ['archive', sha, 'collection-control'])
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(tmp / 'control', filter='data')
        control = tmp / 'control/collection-control'
        roots = [('main', w.ROOT.resolve())]
        if args.runtime:
            w.require(args.runtime.is_dir(), 'Worker runtime missing')
            roots.append(('runtime', args.runtime.resolve()))
        roots += [('control@' + sha + '/artifacts/' + p.name, p) for p in sorted((control / 'artifacts').iterdir()) if p.is_dir()]
        roots += [('control@' + sha, tmp / 'control')]
        backup = args.public_backup.resolve() if args.public_backup else tmp / 'public.json'
        if not args.public_backup:
            w.node(['scripts/public-kg.ts', 'backup', str(backup)])
        public, context = w.public_snapshot(backup)
        raw = w.read(backup)
        context.update(observation='supplied-backup-not-a-live-check' if args.public_backup else 'live-readonly-backup',
            observedAt=raw['payload']['savedAt'], backupChecksum=raw['checksum'],
            backupFileSha256=w.gate.file_hash(backup), backupPath=backup, controlCommit=sha)
        inventory = Inventory(w, roots, public, context)
        # Logical backup provenance is stable across supplied/live reads and scratch paths.
        inventory.formal_receipts()
        inventory.release_candidates()
        inventory.candidates()
        inventory.control(control)
        inventory.collection_themes()
        report = inventory.finish()
        content = {'inventory.json': w.dump(report), 'README.md': markdown(report)}
        if output.exists():
            w.require(w.gate.inventory(output) == {n: w.gate.digest(v.encode()) for n, v in content.items()},
                      'Existing report differs; choose a new output directory')
            unchanged = True
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.inventory-', dir=output.parent) as stage:
                for name, value in content.items():
                    (Path(stage) / name).write_text(value, encoding='utf-8')
                Path(stage).rename(output)
            unchanged = False
        return {'reportDirectory': str(output), 'inventorySha256': report['inventorySha256'],
            'counts': report['counts'], 'releasePreparedCounts': report['releasePreparedCounts'],
            'issues': len(report['issues']), 'reportUnchanged': unchanged, 'sideEffects': report['sideEffects']}
