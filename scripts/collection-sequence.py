"""Approved register continuation. One group per call; never changes a human decision or applies KG."""
import argparse
import copy
from pathlib import Path

SCOPE = 'approved-register-sequential-acceptance-only'
AUTHORITY = 'mechanical-comparison-refresh-not-a-new-human-decision'
NO_APPLY = {'local': False, 'beta': False, 'vps': False}


def add_parser(sub):
    cli = sub.add_parser('accept-sequence', help='One approved register group per existing Worker attempt; first original request must finish')
    cli.add_argument('--register', type=Path, required=True)
    cli.add_argument('--register-sha', required=True)
    cli.add_argument('--state-dir', type=Path, required=True)


def acceptance(w):
    return w.load('sequence_acceptance', w.ROOT / 'scripts/collection-acceptance.py')


def frozen(path, value, w):
    if path.exists():
        w.require(w.read(path) == value, 'Immutable sequence artifact changed: ' + str(path))
    else:
        w.gate.create(path, value)
    return path


def register(path, sha, w):
    """Reuse Phase A's evidence/body/scope checks; a register remains distinct from a receipt."""
    w.require(w.gate.file_hash(path) == sha, 'Approval register hash differs')
    value = w.read(path)
    w.require(value['schemaVersion'] == 1 and value['status'] == 'approved-by-human-pending-sequential-worker-processing'
              and value['scope'] == 'formal-record-acceptance-and-release-preparation-only'
              and value['applyAuthorized'] == NO_APPLY and value['batchDecisions'], 'Explicit approved register required')
    inventory = w.load('sequence_inventory', w.ROOT / 'scripts/collection-inventory.py')
    empty = {f: [] for f in w.FIELDS}
    first = value['batchDecisions'][0]['envelope']['decision']
    check = inventory.Inventory(w, [('runtime', w.ROOT)], empty,
        {'release': first['baseRelease'], 'revision': first['baseRevision']})
    union = {f: set() for f in w.FIELDS}
    decisions = set()
    for batch in value['batchDecisions']:
        envelope = batch['envelope']; decision = envelope['decision']
        w.require(envelope['kind'] == 'accept-release' and envelope['status'] == 'approved'
                  and envelope['applyAuthorized'] == NO_APPLY and decision['humanDecision'] == value['humanDecision'],
                  'Register envelope/human decision differs')
        w.require(decision['decisionId'] not in decisions, 'Duplicate register decision ID')
        decisions.add(decision['decisionId'])
        ids = check.decision(decision, w.ROOT, path, value['approvalId'])
        w.require(not union['claims'].intersection(ids['claims']), 'Duplicate approved Claim in register')
        for f in w.FIELDS:
            union[f].update(ids[f])
    w.require(all(sorted(union[f]) == sorted(value['approvedRecordIds'][f]) for f in w.FIELDS), 'Register UUID union differs')
    return value


def saved_receipt(decision, w):
    """Verify an existing effect against the original decision, not a completed flag or a name."""
    a = acceptance(w)
    target = w.ROOT / 'datasets/manga-collection' / ('accepted-' + a.slug(decision['decisionId'], w))
    if not target.exists():
        return None
    manifest = w.read(target / 'acceptance-manifest.json')
    w.require(manifest['schemaVersion'] == 1 and set(manifest['artifacts']) ==
              {'acceptance.json', 'decision.json', 'accepted-records.json'}, 'Saved receipt inventory differs')
    for file, sha in manifest['artifacts'].items():
        w.require(w.gate.file_hash(target / file) == sha, 'Saved receipt artifact changed')
    receipt = w.read(target / 'acceptance.json')
    w.require(w.read(target / 'decision.json') == decision and receipt['humanDecisionSha256'] == manifest['decisionSha256']
              and receipt['acceptedRecordIds'] == decision['acceptedRecordIds'] and receipt['scopeByClaim'] == decision['scopeByClaim']
              and receipt['status'] == 'accepted-for-release-preparation-only' and receipt['applyAuthorized'] == NO_APPLY,
              'Saved formal acceptance belongs to a different original approval')
    selected = w.read(target / 'accepted-records.json')['records']
    w.require({f: {r['id']: w.digest(r) for r in selected[f]} for f in w.FIELDS} == decision['recordSha256'],
              'Saved acceptance body differs from original approval')
    for ref in receipt['referenceArtifacts']:
        a.checked_reference(ref, w)
    return target, receipt


def prepared_first(first, decision, w):
    if not first or not (first[0] / 'preparation.json').exists():
        return False
    target, receipt = first
    result = w.read(target / 'preparation.json')
    if result['status'] != 'release-prepared-not-applied':
        return False
    w.require(result['decisionId'] == decision['decisionId'] and result['recordedAt'] == receipt['recordedAt']
              and result['publicApply'] is False and result['validation']['valid'] is True and not result['plan'].get('updated'),
              'Original first preparation proof differs')
    release_id = acceptance(w).slug(receipt['combinedReleaseCandidate'], w)
    w.require(release_id == decision['releaseId'] and Path(result['releaseDirectory']).name == release_id,
              'Original first release identity differs')
    # An immutable copied receipt/report may retain the old runtime's absolute path.
    # Resolve the same approved release ID in this runtime; never rewrite the old report.
    release = w.ROOT / 'datasets/public-kg/releases' / release_id
    manifest = w.read(release / 'manifest.json')
    w.require(w.gate.file_hash(release / 'data.json') == manifest['dataSha256'], 'Original first prepared release changed')
    return True


def receipt_projection(public, observed, workspace, w):
    """Rebuild from all hash-backed receipts, including a receipt whose release creation failed."""
    inventory = w.load('sequence_receipt_inventory', w.ROOT / 'scripts/collection-inventory.py')
    check = inventory.Inventory(w, [('runtime', w.ROOT)], public, observed)
    check.formal_receipts()
    w.require(not check.issues, 'Formal receipt evidence conflict: ' + str(check.issues))
    receipts = sorted((w.ROOT / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    w.require(len(check.receipts) == len({w.gate.file_hash(p) for p in receipts}), 'Formal receipt inventory incomplete')
    accepted = {f: list(check.accepted[f].values()) for f in w.FIELDS}
    a = acceptance(w)
    fixture, _ = a.merge(public, accepted, {f: [] for f in w.FIELDS}, w)
    refs = [w.reference(p) for p in receipts]
    # Keep verified historical Claim origins as well as the literal record bodies.
    candidates = set()
    for path in receipts:
        receipt = w.read(path)
        if receipt.get('combinedReleaseCandidate'):
            candidates.add(w.ROOT / 'datasets/public-kg/releases' / receipt['combinedReleaseCandidate'])
        candidates.update((w.ROOT / r['file']).parent for r in receipt['referenceArtifacts'] if Path(r['file']).name == 'manifest.json')
    origins = {}
    for candidate in sorted(candidates):
        if not (candidate / 'manifest.json').exists() or not (candidate / 'data.json').exists():
            continue
        m, data = w.read(candidate / 'manifest.json'), w.read(candidate / 'data.json')
        if not m.get('baseRelease'):
            continue
        w.require(w.gate.file_hash(candidate / 'data.json') == m['dataSha256'], 'Historical accepted release hash changed')
        base = w.index(w.read(w.ROOT / 'datasets/public-kg/releases' / m['baseRelease'] / 'data.json'))
        indexed = w.index(data)
        if not all(all(indexed[f].get(i) == r for i, r in base[f].items()) for f in w.FIELDS):
            continue
        extra = {f: {i: r for i, r in indexed[f].items() if i not in base[f]} for f in w.FIELDS}
        if not all(all(check.accepted[f].get(i) == r for i, r in extra[f].items()) for f in w.FIELDS):
            continue
        for origin in m['claimOrigins']:
            ident = origin['claimId']
            if ident in extra['claims']:
                w.require(ident not in origins or origins[ident] == origin, 'Historical accepted Claim origin conflict')
                origins[ident] = origin
    key = w.digest({'public': observed, 'receipts': refs})
    ident = 'comparison-' + key[:24]
    manifest = copy.deepcopy(w.read(w.ROOT / 'datasets/public-kg/releases' / observed['release'] / 'manifest.json'))
    manifest.update(release=ident, baseRelease=observed['release'], dataSha256=w.gate.digest(w.dump(fixture).encode()),
        reason='正式受入receiptの不変本文から再構築した比較集合。公開apply用の追加承認ではない。')
    manifest['inputs'] += [{'dataset': 'manga-workflow-accepted', **r} for r in refs if r not in manifest['inputs']]
    existing = {c['claimId'] for c in manifest['claimOrigins']}
    manifest['claimOrigins'] += [origins.get(c['id'], {'claimId': c['id'], 'dataset': 'manga-workflow-accepted', 'sourceClaimId': c['id']})
                               for c in fixture['claims'] if c['id'] not in existing]
    directory = workspace / 'comparisons' / key
    a.immutable_directory(directory, {'data.json': w.dump(fixture), 'manifest.json': w.dump(manifest)}, w)
    additions, checked = w.accepted_additions(directory, receipts)
    return directory, additions, checked, refs


def universe(context, selected, w):
    a = acceptance(w)
    prior, _, _, _ = a.prior_accepted(context, w)
    public = w.read(w.ROOT / 'datasets/public-kg/releases' / context['public']['release'] / 'data.json')
    known = w.index(public)
    for group in [prior, selected]:
        for f in w.FIELDS:
            for record in group[f]:
                value = copy.deepcopy(record)
                if f == 'claims':
                    value['visibility'] = 'hidden'  # Storage visibility is not the approved Claim meaning.
                previous = known[f].get(value['id'])
                if previous and f == 'claims':
                    previous = {**previous, 'visibility': 'hidden'}
                w.require(previous is None or previous == value, 'Dependency UUID content differs from approval')
                known[f][value['id']] = value
    return known


def dependency_signature(selected, known, w):
    ids = {f: {r['id'] for r in selected[f]} for f in w.FIELDS}
    claims = ids['claims']
    for c in selected['claims']:
        ids['entities'].update([c['subjectId'], c['objectId']])
    for c in known['citations'].values():
        if c['claimId'] in claims:
            ids['citations'].add(c['id'])
            ids['sources'].add(c['sourceId'])
    for c in selected['citations']:
        ids['claims'].add(c['claimId']); ids['sources'].add(c['sourceId'])
    return {f: {ident: w.digest(known[f][ident]) for ident in sorted(ids[f])} for f in w.FIELDS}


def equivalence(decision, refreshed_review, w):
    a = acceptance(w)
    original_path = a.checked_reference(decision['review'], w)
    old_context, _, old_records, _ = a.bundle(original_path.parent, w)
    context, _, fresh_records, refs = a.bundle(refreshed_review, w)
    w.require(context['jobId'] == old_context['jobId'] and context['jobArtifacts'] == old_context['jobArtifacts']
              and context['workOrderSha256'] == old_context['workOrderSha256'], 'Refreshed job/evidence differs from approval')
    w.require((context['public']['release'], context['public']['revision']) == (decision['baseRelease'], decision['baseRevision']),
              'Public base/revision changed; a new human review is required')
    selected = a.selection(decision['acceptedRecordIds'], old_records, w)
    old = universe(old_context, selected, w)
    # Resolve explicitly approved dependencies that a fresh review now marks as exact reuse.
    fresh_selected = {f: list(fresh_records[f].values()) for f in w.FIELDS}
    fresh = universe(context, fresh_selected, w)
    reviewed = w.read(refreshed_review / 'review.json')
    for field, key in [('claims', 'claimId'), ('entities', 'entityId')]:
        for r in reviewed[field]:
            if r[key] in decision['acceptedRecordIds'][field]:
                w.require(r['status'] != 'held', 'Approved target is held in refreshed review')
    for f in w.FIELDS:
        for record in selected[f]:
            current = copy.deepcopy(fresh[f].get(record['id']))
            w.require(current is not None, 'Approved target missing from refreshed eligible/reused records')
            if f == 'claims':
                current['visibility'] = record['visibility']
            w.require(w.digest(current) == decision['recordSha256'][f][record['id']], 'Refreshed approved record body/Role/scope differs')
    original_signature = dependency_signature(selected, old, w)
    current_signature = dependency_signature(selected, fresh, w)
    w.require(original_signature == current_signature, 'Source/Citation/endpoint dependency set or body differs from original approval')
    return context, refs, original_signature


def verify_continuation(args, decision, w):
    a = acceptance(w)
    path = args.continuation.resolve()
    w.require(args.continuation_sha and w.gate.file_hash(path) == args.continuation_sha, 'Continuation proof hash differs')
    proof = w.read(path)
    w.require(proof['schemaVersion'] == 1 and proof['authority'] == AUTHORITY and proof['publicApply'] is False,
              'Mechanical continuation proof required')
    original = a.checked_reference(proof['originalDecision'], w)
    w.require(original == args.decision.resolve() and w.read(original) == decision, 'Continuation original approval differs')
    reg = a.checked_reference(proof['register'], w)
    value = register(reg, proof['register']['sha256'], w)
    choices = [b['envelope']['decision'] for b in value['batchDecisions'] if b['envelope']['decision']['decisionId'] == decision['decisionId']]
    w.require(choices == [decision], 'Continuation decision is not the exact registered human approval')
    review = a.checked_reference(proof['refreshedReview'], w).parent
    context, refs, signature = equivalence(decision, review, w)
    w.require(proof['dependencySignature'] == signature, 'Continuation dependency proof differs')
    a.protect_inputs([args.acceptances / ('accepted-' + decision['decisionId']), args.releases / decision['releaseId']], review, context, w)
    return context, refs + [w.reference(path), w.reference(reg)]


def prepare_saved(decision, target, receipt, public, observed, workspace, w):
    """Finish an already saved acceptance against all current receipts, without saving/rebinding it again."""
    a = acceptance(w)
    original = a.checked_reference(decision['review'], w)
    context, _, _, _ = a.bundle(original.parent, w)
    a.same_public({'release': decision['baseRelease'], 'revision': decision['baseRevision']}, observed, w)
    comparison, additions, refs, receipt_refs = receipt_projection(public, observed, workspace, w)
    outputs = w.review_job(Path(context['jobDirectory']), public, observed, additions, refs)
    review, _ = w.write_review(workspace / 'reviews', outputs)
    equivalence(decision, review, w)
    key = w.digest({'public': observed, 'receipts': receipt_refs})
    release = w.ROOT / 'datasets/public-kg/releases' / ('sequence-prepared-' + key[:24])
    fixture = w.read(comparison / 'data.json')
    manifest = w.read(comparison / 'manifest.json')
    manifest.update(release=release.name, reason='既存の正式受入receiptだけによる累積公開準備。元の承認・受入・旧releaseは不変。')
    a.immutable_directory(release, {'data.json': w.dump(fixture), 'manifest.json': w.dump(manifest)}, w)
    validation = w.node(['scripts/public-kg.ts', 'validate', str(release)])
    w.require(validation['valid'], 'Saved acceptance cumulative validation failed')
    _, before = w.public_snapshot(); a.same_public(observed, before, w)
    w.require(before == observed, 'Public observation changed before saved preparation plan')
    plan = w.node(['scripts/public-kg.ts', 'plan', str(release)])
    _, after = w.public_snapshot()
    w.require(after == before and not plan.get('updated'), 'Saved preparation plan changed public state or existing records')
    saved_receipt(decision, w)
    w.require(receipt_refs == [w.reference(p) for p in sorted((w.ROOT / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))],
              'Formal receipt set changed during saved preparation')
    result = {'status': 'release-prepared-not-applied', 'decisionId': decision['decisionId'],
        'acceptance': str(target / 'acceptance.json'), 'recordedAt': receipt['recordedAt'], 'acceptanceReused': True,
        'releaseDirectory': str(release), 'validation': validation, 'plan': plan, 'publicBeforePlan': before,
        'publicAfterPlan': after, 'publicApply': False, 'originalReleaseCandidate': receipt['combinedReleaseCandidate'],
        'receiptReferences': receipt_refs, 'refreshedReview': w.reference(review / 'review-manifest.json')}
    frozen(workspace / 'prepared' / (decision['decisionId'] + '-' + w.digest(result)[:20] + '.json'), result, w)
    return result


def execute(args, w):
    a = acceptance(w)
    reg_path = args.register.resolve()
    value = register(reg_path, args.register_sha, w)
    workspace = args.state_dir.resolve()
    w.require(workspace.is_relative_to(w.ROOT / '.local/acceptance-sequences')
              and workspace != w.ROOT / '.local/acceptance-sequences', 'Sequence state must use its own private runtime directory')
    # This is the same acceptance-root lock used by accept-release. Do not nest its CLI wrapper.
    with w.gate.locked(w.ROOT / 'datasets/manga-collection'):
        workspace.mkdir(parents=True, exist_ok=True)
        frozen(workspace / 'register.json', value, w)
        state_path = workspace / 'state.json'
        state = w.read(state_path) if state_path.exists() else {'schemaVersion': 1, 'registerSha256': args.register_sha, 'groups': {}}
        w.require(state['registerSha256'] == args.register_sha, 'Sequence register cannot be rebound')
        decisions = [b['envelope']['decision'] for b in value['batchDecisions']]
        for decision in decisions:
            expected = w.ROOT / 'datasets/manga-collection' / ('accepted-' + decision['decisionId']) / 'acceptance.json'
            for path in (w.ROOT / 'datasets/manga-collection').glob('accepted-*/acceptance.json'):
                if path != expected:
                    old = w.read(path)
                    w.require(not set(old['acceptedRecordIds']['claims']).intersection(decision['acceptedRecordIds']['claims']),
                              'Approved Claim already accepted by another decision; human ownership review required')
        first = saved_receipt(decisions[0], w)
        if not prepared_first(first, decisions[0], w):
            return {'status': 'waiting-existing-first-request', 'sequenceComplete': False, 'stateDirectory': str(workspace),
                'existingRequestId': value['batchDecisions'][0]['envelope']['id'], 'publicApply': False,
                'notice': 'Do not register or accept the first group again. Complete/resume its original Worker request before deploying this sequence.'}
        # The first group stays owned by the original request. Its immutable effect is verified above.
        state['groups'][decisions[0]['decisionId']] = {'status': 'completed-by-original-request', 'acceptance': w.reference(first[0] / 'acceptance.json')}
        for decision in decisions[1:]:
            ident = decision['decisionId']; prior_state = state['groups'].get(ident, {})
            existing = saved_receipt(decision, w)
            if prior_state.get('status') == 'completed':
                w.require(existing and prior_state['acceptance'] == w.reference(existing[0] / 'acceptance.json'), 'Completed sequence effect changed')
                for ref in prior_state['releaseReferences']:
                    a.checked_reference(ref, w)
                continue
            state['currentDecisionId'] = ident
            w.gate.save(state_path, state)
            decision_path = frozen(workspace / 'decisions' / (ident + '.json'), decision, w)
            public, observed = w.public_snapshot()
            a.same_public({'release': decision['baseRelease'], 'revision': decision['baseRevision']}, observed, w)
            if existing:
                # A prior attempt may have persisted the receipt, then stopped before release/validate/plan.
                # Old-comparison accept-release still rejects new receipts; finish preparation separately.
                result = prepare_saved(decision, *existing, public, observed, workspace, w)
            else:
                comparison, additions, refs, _ = receipt_projection(public, observed, workspace, w)
                original_review = a.checked_reference(decision['review'], w).parent
                context, _, _, _ = a.bundle(original_review, w)
                outputs = w.review_job(Path(context['jobDirectory']), public, observed, additions, refs)
                review, _ = w.write_review(workspace / 'reviews', outputs)
                _, _, signature = equivalence(decision, review, w)
                proof = {'schemaVersion': 1, 'authority': AUTHORITY, 'originalDecision': w.reference(decision_path),
                    'register': w.reference(reg_path), 'refreshedReview': w.reference(review / 'review-manifest.json'),
                    'dependencySignature': signature, 'publicApply': False}
                proof_path = frozen(workspace / 'proofs' / (ident + '-' + w.digest(proof)[:20] + '.json'), proof, w)
                state['groups'][ident] = {'status': 'comparison-proved', 'proof': w.reference(proof_path)}
                w.gate.save(state_path, state)
                call = argparse.Namespace(decision=decision_path, decision_sha=w.gate.file_hash(decision_path),
                    acceptances=w.ROOT / 'datasets/manga-collection', releases=w.ROOT / 'datasets/public-kg/releases',
                    continuation=proof_path, continuation_sha=w.gate.file_hash(proof_path))
                result = a.accept(call, w)
            target, _ = saved_receipt(decision, w)
            state['groups'][ident] = {'status': 'completed', 'acceptance': w.reference(target / 'acceptance.json'), 'result': result,
                'releaseReferences': [w.reference(Path(result['releaseDirectory']) / name) for name in ['data.json', 'manifest.json']]}
            state.pop('currentDecisionId', None)
            w.gate.save(state_path, state)
            return {'status': 'sequence-progress', 'sequenceComplete': False, 'stateDirectory': str(workspace),
                'completedDecisionId': ident, 'completedGroups': len([g for g in state['groups'].values() if g['status'].startswith('completed')]),
                'lastResult': result, 'publicApply': False}
        state['status'] = 'completed'; state.pop('currentDecisionId', None); w.gate.save(state_path, state)
        return {'status': 'sequence-completed-not-applied', 'sequenceComplete': True, 'stateDirectory': str(workspace),
            'completedGroups': len(decisions), 'approvedRecordIds': value['approvedRecordIds'], 'publicApply': False}
