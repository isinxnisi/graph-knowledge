"""Task2 helpers for collection-workflow.py. Fixed read/validate/plan calls only."""
import copy
from datetime import datetime, timezone
from pathlib import Path
import re
import tempfile


def evidence_module(w):
    return w.load('saved_evidence_acceptance', Path(__file__).with_name('collection-evidence.py'))


def source_directory(context):
    return Path(context['evidenceDirectory'] if context.get('sourceKind') in ['saved-evidence-v1', 'film-discovery-v1'] else context['jobDirectory'])


def observe(args, w):
    if getattr(args, 'production_backup', None):
        return evidence_module(w).observe(args, w)
    return w.public_snapshot()


def check_public(expected, observed, args, w):
    if getattr(args, 'production_backup', None):
        w.require(getattr(args, 'command', None) in ['accept-evidence', 'accept-film'], 'Backup mode is restricted to saved-evidence/film acceptance')
        w.require(observed['observation'] == 'supplied-backup-not-a-live-check'
                  and observed.get('productionBackupSha256') == args.backup_sha
                  and observed.get('liveMetadata', {}).get('revision') == expected['revision'], 'Verified production backup and live revision required')
        w.require(all(observed[k] == expected[k] for k in ['release', 'revision']), 'Public base/revision conflict; review the new state')
    else:
        same_public(expected, observed, w)

SCOPE = 'formal-record-acceptance-and-release-preparation-only'
NO_APPLY = {'local': False, 'beta': False, 'vps': False}


def add_parsers(sub, root):
    template = sub.add_parser('decision-template', help='Write an unsigned, non-authoritative human decision draft')
    template.add_argument('--review', type=Path, required=True)
    template.add_argument('--group', choices=['normal', 'identity-only'], default='normal')
    template.add_argument('--claim-id', action='append', default=[], help='Optional partial selection; include its new dependencies')
    template.add_argument('--decision-id', required=True)
    template.add_argument('--release', required=True)
    template.add_argument('--output', type=Path, required=True)
    accept = sub.add_parser('accept-release', help='Human decision -> immutable acceptance/release -> validate -> fresh read-only plan')
    accept.add_argument('--decision', type=Path, required=True)
    accept.add_argument('--decision-sha', required=True, help='SHA-256 of the completed human decision file')
    accept.add_argument('--acceptances', type=Path, default=root / 'datasets/manga-collection')
    accept.add_argument('--releases', type=Path, default=root / 'datasets/public-kg/releases')
    accept.add_argument('--continuation', type=Path, help='Hash-bound mechanical comparison refresh; original human decision stays immutable')
    accept.add_argument('--continuation-sha', help='SHA-256 of the separate continuation proof')


def slug(value, w):
    w.require(isinstance(value, str) and len(value) <= 80 and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value), 'Invalid decision/release ID')
    return value


def checked_reference(row, w, parent=None):
    w.require(set(row) == {'file', 'sha256'} and isinstance(row['file'], str), 'Explicit file/hash reference required')
    path = Path(row['file'])
    path = (parent / path if parent else w.ROOT / path).resolve()
    if parent:
        w.require(path.is_relative_to(parent.resolve()), 'Review reference escapes its bundle')
    w.require(w.gate.file_hash(path) == row['sha256'], 'Reference hash mismatch: ' + str(path))
    return path


def bundle(directory, w):
    """Only the immutable Task1 format; recommendations remain non-authoritative."""
    directory = directory.resolve()
    manifest = w.read(directory / 'review-manifest.json')
    if manifest.get('sourceKind') == 'film-discovery-v1':
        return w.load('film_review_bundle', w.CODE_ROOT / 'scripts/collection-film.py').bundle(directory, w)
    if manifest.get('sourceKind') == 'saved-evidence-v1':
        return evidence_module(w).bundle(directory, w)
    w.require(manifest['schemaVersion'] == 1 and manifest['authority'] == 'pending-human-review-only', 'Unsupported review format')
    actual = w.gate.inventory(directory)
    w.require(actual == {**manifest['artifacts'], 'review-manifest.json': w.gate.file_hash(directory / 'review-manifest.json')},
              'Review artifact inventory/hash mismatch')
    context, request = w.read(directory / 'context.json'), w.read(directory / 'decision-request.json')
    w.require(w.digest(context) == manifest['inputSha256'] and request['status'] == 'pending-human-decision', 'Review context differs')
    for row in request['referenceArtifacts']:
        checked_reference(row, w, directory)
    w.require(not w.read(directory / 'review.json')['recordConflicts'], 'Unresolved reviewed record conflict')
    state = w.verify_job(Path(context['jobDirectory']))
    w.require(state['jobId'] == context['jobId'] and state['artifacts'] == context['jobArtifacts']
              and w.gate.file_hash(Path(context['jobDirectory']) / 'work-order.json') == context['workOrderSha256'],
              'Frozen collection job differs from review')
    for row in context['public']['references']:
        checked_reference(row, w)
    for file, sha in context['acceptedReferences']:
        checked_reference({'file': file, 'sha256': sha}, w)
    records = {f: [] for f in w.FIELDS}
    for name in ['proposed-records.json', 'identity-only-records.json']:
        for field, rows in w.read(directory / name)['records'].items():
            records[field] += rows
    indexed = w.index(records)
    eligible = {f: set() for f in w.FIELDS}
    for group in request['groups'].values():
        for f in w.FIELDS:
            eligible[f].update(group['recordIds'][f])
    w.require(all(set(indexed[f]) == eligible[f] for f in w.FIELDS), 'Reviewed group/record inventory differs')
    w.require(not (eligible['claims'] & set(request['heldClaimIds']))
              and not (eligible['entities'] & set(request['heldEntityIds'])), 'Held records cannot enter this acceptance workflow')
    refs = [w.reference(directory / name) for name in sorted(actual)]
    return context, request, indexed, refs


def selection(ids, records, w):
    w.require(set(ids) == set(w.FIELDS), 'Explicit IDs for all four record types required')
    result = {}
    for f in w.FIELDS:
        w.require(isinstance(ids[f], list) and len(ids[f]) == len(set(ids[f])) and set(ids[f]) <= set(records[f]),
                  'Duplicate, held or unreviewed accepted ID: ' + f)
        result[f] = [copy.deepcopy(records[f][ident]) for ident in sorted(ids[f])]
    w.require(any(result.values()), 'Empty acceptance is not a human record decision')
    return result


def scope_rows(records, w):
    return [{'id': c['id'], **w.semantic(c)} for c in records['claims']]


def protect_inputs(outputs, review, context, w):
    protected = {review.resolve(), source_directory(context).resolve(), w.gate.REGISTRY.resolve()}
    refs = context['public']['references'] + [{'file': p, 'sha256': sha} for p, sha in context['acceptedReferences']]
    protected.update((w.ROOT / row['file']).resolve().parent for row in refs)
    for output in outputs:
        target = output.resolve()
        w.require(not any(target == p or target.is_relative_to(p) or p.is_relative_to(target) for p in protected),
                  'Output overlaps frozen review, job, registry or referenced artifacts')


def template(args, w):
    context, request, records, refs = bundle(args.review, w)
    ids = copy.deepcopy(request['groups'][args.group]['recordIds'])
    if args.claim_id:
        w.require(args.group == 'normal' and len(args.claim_id) == len(set(args.claim_id))
                  and set(args.claim_id) <= set(ids['claims']), 'Partial Claim selection outside normal reviewed group')
        claims = [records['claims'][i] for i in args.claim_id]
        cites = [records['citations'][i] for i in ids['citations'] if records['citations'][i]['claimId'] in args.claim_id]
        ids = {'claims': sorted(args.claim_id), 'citations': sorted(c['id'] for c in cites),
               'entities': sorted({c[k] for c in claims for k in ['subjectId', 'objectId']} & set(ids['entities'])),
               'sources': sorted({c['sourceId'] for c in cites} & set(ids['sources']))}
    selected = selection(ids, records, w)
    protect_inputs([args.output], args.review, context, w)
    result = {'schemaVersion': 1, 'decisionId': slug(args.decision_id, w), 'status': 'draft-not-approved',
              'humanDecision': {'actorType': 'human', 'reviewer': None, 'decidedAt': None, 'statement': None},
              'approvalScope': SCOPE, 'applyAuthorized': NO_APPLY,
              'review': w.reference(args.review.resolve() / 'review-manifest.json'),
              'referenceArtifacts': refs, 'acceptedRecordIds': {f: [r['id'] for r in selected[f]] for f in w.FIELDS},
              'recordSha256': {f: {r['id']: w.digest(r) for r in selected[f]} for f in w.FIELDS},
              'scopeByClaim': scope_rows(selected, w), 'baseRelease': context['public']['release'],
              'baseRevision': context['public']['revision'], 'releaseId': slug(args.release, w)}
    if context.get('sourceKind') == 'film-discovery-v1':
        result['identityDecision'] = None
    if context.get('sourceKind'):
        result['sourceKind'] = context['sourceKind']
    w.require(args.output.resolve() not in [Path(r['file']).resolve() for r in refs], 'Decision must not replace review artifacts')
    w.gate.create(args.output.resolve(), result)
    return {'decisionFile': str(args.output.resolve()), 'status': result['status'], 'formalAcceptance': False, 'publicApply': False}


def prior_accepted(context, w):
    refs = context['acceptedReferences']
    receipts = [w.ROOT / p for p, sha in refs if Path(p).name == 'acceptance.json']
    if not refs:
        return {f: [] for f in w.FIELDS}, [], [], {'inputs': [], 'claimOrigins': []}
    # A receipt-covered candidate can already be the live public release on the next batch.
    candidates = [((w.ROOT / p).parent) for p, sha in refs if Path(p).name == 'manifest.json']
    valid = []
    pinned = {tuple(r) for r in refs}
    for path in candidates:
        try:
            records, checked = w.accepted_additions(path, receipts)
            if set(checked) <= pinned:
                valid.append((records, w.read(path / 'manifest.json')))
        except (ValueError, KeyError):
            continue
    w.require(valid and len({w.digest(v[0]) for v in valid}) == 1, 'Reviewed accepted comparison set is incomplete or ambiguous')
    origins = [{r['claimId']: r for r in m['claimOrigins'] if r['claimId'] in {c['id'] for c in data['claims']}}
               for data, m in valid]
    w.require(len({w.digest(v) for v in origins}) == 1, 'Accepted Claim origin conflict')
    return valid[0][0], receipts, [{'file': p, 'sha256': sha} for p, sha in refs], valid[0][1]


def merge(public, prior, selected, w):
    """Exact reuse only. Different meaning, scope or identity never silently replaces a UUID."""
    known = w.index(public)
    reused = {f: [] for f in w.FIELDS}
    for additions in [prior, selected]:
        w.index(additions)
        for f in w.FIELDS:
            for value in additions[f]:
                row = copy.deepcopy(value)
                if f == 'claims':
                    if additions is selected:
                        w.require(row['visibility'] == 'hidden', 'New reviewed Claim must be hidden')
                    row['visibility'] = 'published'
                ident = row['id']
                if ident in known[f]:
                    w.require(known[f][ident] == row, 'UUID content/meaning/withdrawal conflict: ' + ident)
                    if additions is selected:
                        reused[f].append(ident)
                    continue
                w.require(not any(ident in known[other] for other in w.FIELDS if other != f), 'UUID type collision: ' + ident)
                if f == 'entities':
                    for old in known[f].values():
                        w.require(not ({(x['namespace'], x['value']) for x in old['externalIds']}
                                      & {(x['namespace'], x['value']) for x in row['externalIds']}), 'ExternalIdentifier identity collision')
                        w.require(old['kind'] != row['kind'] or not (
                            {w.manga.norm(n) for n in [old['name'], *old['aliases']]}
                            & {w.manga.norm(n) for n in [row['name'], *row['aliases']]}), 'Entity identity needs explicit reviewed UUID mapping')
                elif f == 'claims':
                    w.require(not any(w.semantic(c) == w.semantic(row) for c in known[f].values()), 'Duplicate Claim meaning under another UUID')
                elif f == 'sources':
                    w.require(not row['url'] or not any(s['url'] == row['url'] for s in known[f].values()), 'Duplicate Source URL; reuse reviewed UUID')
                else:
                    w.require(not any((c['claimId'], c['sourceId']) == (row['claimId'], row['sourceId']) for c in known[f].values()),
                              'Duplicate Claim/Source Citation; review reuse explicitly')
                known[f][ident] = row
    for c in known['claims'].values():
        w.require(c['subjectId'] in known['entities'] and c['objectId'] in known['entities'], 'Missing explicitly accepted endpoint dependency')
    for c in known['citations'].values():
        w.require(c['claimId'] in known['claims'] and c['sourceId'] in known['sources'], 'Missing explicitly accepted evidence dependency')
    for c in selected['claims']:
        w.require(any(v['claimId'] == c['id'] and v['stance'] == 'support' for v in known['citations'].values()), 'Accepted Claim lacks supporting Citation')
    return {**public, **{f: sorted(known[f].values(), key=lambda r: r['id']) for f in w.FIELDS}}, reused


def immutable_directory(target, files, w):
    expected = {k: w.gate.digest(v.encode()) for k, v in files.items()}
    if target.exists():
        w.require(w.gate.inventory(target) == expected, 'Existing immutable release differs; use a new release ID')
        return True
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.accept-staging-', dir=target.parent) as tmp:
        staging = Path(tmp) / 'bundle'
        staging.mkdir()
        for name, content in files.items():
            (staging / name).write_text(content, encoding='utf-8')
        staging.rename(target)
    return False


def same_public(expected, observed, w):
    w.require(observed['observation'] == 'live-readonly-backup', 'Acceptance plan requires a fresh live read-only observation')
    w.require(all(observed[k] == expected[k] for k in ['release', 'revision']), 'Public base/revision conflict; review the new state')


def report_markdown(report):
    text = '# 正式受入と公開release準備\n\n状態: ' + report['status'] + '。公開applyは未実施。\n\n'
    text += '判断ID: `' + report['decisionId'] + '`。実記録日時: ' + report['recordedAt'] + '。\n\n'
    if report['status'] != 'release-prepared-not-applied':
        return text + '成功済みの受入記録・releaseを保持。同じ判断ファイル／hashで再試行し、最新planを確認する。\n'
    text += '| 対象 | 今回の承認対象 | 現公開baseからの統合追加 |\n| --- | ---: | ---: |\n'
    for field in report['acceptedCounts']:
        text += '| ' + field + ' | ' + str(report['acceptedCounts'][field]) + ' | ' + str(report['releaseAdditions'][field]) + ' |\n'
    plan_note = ('検証済み本番backupに対するoffline plan成功（最新VPS実planは未実施）'
                 if report.get('planObservation') == 'validated-production-backup-offline' else '最新の無書込plan成功')
    text += '\nrelease: `' + report['releaseDirectory'] + '`。validate成功、' + plan_note + '、既存更新0。\n\n'
    text += '未受入対象・既存再利用・保留UUID・plan全件はpreparation.json。保留や未選択レコードを自動受入しない。\n\n'
    text += '## 保留\n\n'
    for row in report['heldRecords']['claims']:
        text += '- ' + str(row['person']) + ' → ' + str(row['work']) + '／' + ', '.join(row['reasons']) + '\n'
    for row in report['heldRecords']['entities']:
        text += '- ' + row['name'] + '／' + ', '.join(row['reasons']) + '\n'
    text += '\n原責任表示の取得時保留はpreparation.jsonのinheritedHoldsに原語・理由を保持する。未選択の受入推奨は保留とは別に未判断のまま残す。\n\n'
    text += '## 代表経路\n\n正式受入済み未適用の接続を含む。公開画面での実探索確認ではない。\n\n'
    for path in report['explorationPaths']:
        text += '- ' + ' ; '.join(e['person'] + ' → ' + e['work'] + ' [' + str(e['roleId']) + '; ' + e['claimId'] + ']'
                                 for e in path['edges']) + '／' + path['state'] + '\n'
    text += '\n接続ごとのscope・Citation・Sourceはpreparation.jsonに保持。新しい直接関係は推測生成しない。公開前には別のapply承認と適用先での最新検証が必要。\n'
    return text


def accept(args, w):
    args.decision = args.decision.resolve()
    w.require(w.gate.file_hash(args.decision) == args.decision_sha, 'Human decision hash mismatch')
    decision = w.read(args.decision)
    w.require(decision['schemaVersion'] == 1 and decision['status'] == 'approved', 'Explicit human approval required; draft/recommendation/group is not approval')
    human = decision['humanDecision']
    w.require(human['actorType'] == 'human' and isinstance(human['reviewer'], str) and human['reviewer'].strip()
              and isinstance(human['statement'], str) and human['statement'].strip(), 'Named human reviewer and explicit acceptance statement required')
    when = datetime.fromisoformat(human['decidedAt'])
    w.require(when.tzinfo is not None and when <= datetime.now(timezone.utc), 'Actual human decision time with timezone required')
    w.require(decision['approvalScope'] == SCOPE and decision['applyAuthorized'] == NO_APPLY, 'Formal acceptance/release preparation only; no apply authorization')
    review_manifest = checked_reference(decision['review'], w)
    w.require(review_manifest.name == 'review-manifest.json', 'A hashed Task1 review manifest is required')
    review = review_manifest.parent
    context, request, records, review_refs = bundle(review, w)
    w.require(decision.get('sourceKind') == context.get('sourceKind'), 'Decision source kind differs from review')
    w.require(decision['referenceArtifacts'] == review_refs, 'Human-approved evidence inventory differs')
    selected = selection(decision['acceptedRecordIds'], records, w)
    if context.get('sourceKind') == 'film-discovery-v1':
        w.require(getattr(args, 'command', None) == 'accept-film' and context.get('productionAcceptanceReady') is True,
                  'Film acceptance requires guarded accept-film and a fresh production review')
        w.load('film_human_decision', w.CODE_ROOT / 'scripts/collection-film.py').validate_decision(decision, selected, w)
    w.require(decision['recordSha256'] == {f: {r['id']: w.digest(r) for r in selected[f]} for f in w.FIELDS}, 'Approved record body/hash differs')
    w.require(decision['scopeByClaim'] == scope_rows(selected, w), 'Approved Claim meaning/Role/scope differs')
    w.require(decision['baseRelease'] == context['public']['release'] and decision['baseRevision'] == context['public']['revision'],
              'Decision public base/revision differs from reviewed observation')
    continuation = None
    if getattr(args, 'continuation', None):
        sequence = w.load('acceptance_continuation', w.ROOT / 'scripts/collection-sequence.py')
        context, added_refs = sequence.verify_continuation(args, decision, w)
        review_refs = list({(r['file'], r['sha256']): r for r in review_refs + added_refs}.values())
        continuation = w.reference(args.continuation)
    else:
        w.require(not getattr(args, 'continuation_sha', None), 'Continuation proof file required')
    ident, release_id = slug(decision['decisionId'], w), slug(decision['releaseId'], w)
    w.require(release_id != decision['baseRelease'], 'A new immutable release ID is required')
    target = args.acceptances.resolve() / ('accepted-' + ident)
    release = args.releases.resolve() / release_id
    protect_inputs([target, release], review, context, w)
    protected = [review, source_directory(context).resolve(), args.decision]
    w.require(not any(p == target or p.is_relative_to(target) or p == release or p.is_relative_to(release) for p in protected), 'Output overlaps frozen inputs')
    prior, receipts, prior_refs, prior_manifest = prior_accepted(context, w)
    # A newly accepted set outside this decision's comparison snapshot requires a new review.
    present = set(args.acceptances.resolve().glob('accepted-*/acceptance.json')) - {target / 'acceptance.json'}
    w.require(present <= {p.resolve() for p in receipts}, 'Additional formal acceptances exist outside the reviewed comparison set')
    public, observed = observe(args, w)
    expected = {'release': decision['baseRelease'], 'revision': decision['baseRevision']}
    check_public(expected, observed, args, w)
    if context.get('sourceKind') in ['saved-evidence-v1', 'film-discovery-v1'] and context.get('public', {}).get('productionBackupSha256'):
        w.require(context['public'] == observed, 'Saved-evidence production comparison changed')
    fixture, reused = merge(public, prior, selected, w)
    data = (evidence_module(w).release_data(fixture, w)
            if context.get('sourceKind') in ['saved-evidence-v1', 'film-discovery-v1'] else w.dump(fixture))
    base_path = w.ROOT / 'datasets/public-kg/releases' / observed['release']
    manifest = copy.deepcopy(w.read(base_path / 'manifest.json'))
    accepted_path = target / 'accepted-records.json'
    selected_text = w.dump({'records': selected})
    decision_text = w.dump(decision)
    receipt = {'version': 1, 'status': 'accepted-for-release-preparation-only', 'reviewer': human['reviewer'],
        'recordedAt': datetime.now(timezone.utc).isoformat(), 'instructionAt': human['decidedAt'], 'humanInstruction': human['statement'],
        'decisionId': ident, 'humanDecisionSha256': args.decision_sha,
        'referenceArtifacts': review_refs + prior_refs + observed['references'] + [
            {'file': w.reference(args.decision)['file'], 'sha256': args.decision_sha},
            {'file': str(accepted_path.relative_to(w.ROOT)) if accepted_path.is_relative_to(w.ROOT) else str(accepted_path),
             'sha256': w.gate.digest(selected_text.encode())}],
        'acceptedRecordIds': decision['acceptedRecordIds'], 'scopeByClaim': decision['scopeByClaim'],
        'counts': {f: len(selected[f]) for f in w.FIELDS}, 'baseRelease': observed['release'], 'baseRevision': observed['revision'],
        'combinedReleaseCandidate': release_id, 'sourceJobId': context.get('jobId'), 'applyAuthorized': NO_APPLY}
    if context.get('sourceKind') in ['saved-evidence-v1', 'film-discovery-v1'] and context.get('public', {}).get('productionBackupSha256'):
        receipt['sourceReviewKind'] = context['sourceKind']
        receipt['productionObservation'] = observed
        receipt['acceptanceProgramSha256'] = context['programSha256']
    if continuation:
        receipt['comparisonContinuation'] = continuation
    immutable = {'decision.json': decision_text, 'accepted-records.json': selected_text}
    receipt_exists = (target / 'acceptance.json').exists()
    if target.exists():
        w.require(receipt_exists, 'Incomplete acceptance directory; never overwrite')
        saved_manifest = w.read(target / 'acceptance-manifest.json')
        w.require(saved_manifest['schemaVersion'] == 1 and saved_manifest['decisionSha256'] == args.decision_sha
                  and set(saved_manifest['artifacts']) == {'acceptance.json', 'decision.json', 'accepted-records.json'}
                  and all(w.gate.file_hash(target / name) == sha for name, sha in saved_manifest['artifacts'].items()),
                  'Immutable acceptance inventory/hash differs')
        saved = w.read(target / 'acceptance.json')
        receipt['recordedAt'] = saved['recordedAt']
        w.require(saved == receipt and all((target / n).read_text(encoding='utf-8') == v for n, v in immutable.items()),
                  'Existing acceptance differs; cannot rebind decision ID or change its recording time')
    immutable['acceptance.json'] = w.dump(receipt)
    immutable['acceptance-manifest.json'] = w.dump({'schemaVersion': 1, 'decisionSha256': args.decision_sha,
        'artifacts': {name: w.gate.digest(content.encode()) for name, content in immutable.items()}})
    receipt_path = target / 'acceptance.json'
    manifest.update(release=release_id, baseRelease=observed['release'], dataSha256=w.gate.digest(data.encode()),
        reason='人間の明示的な判断に基づく受入済み集合の公開準備。公開applyは別承認待ち。')
    receipt_ref = {'file': str(receipt_path.relative_to(w.ROOT)) if receipt_path.is_relative_to(w.ROOT) else str(receipt_path),
                   'sha256': w.gate.digest(immutable['acceptance.json'].encode())}
    for row in prior_manifest['inputs'] + [{'dataset': 'film-workflow-accepted' if context.get('sourceKind') == 'film-discovery-v1' else 'manga-workflow-accepted', **r} for r in receipt['referenceArtifacts'] + [receipt_ref]]:
        if row not in manifest['inputs']:
            manifest['inputs'].append(row)
    base_claim_ids = {c['id'] for c in public['claims']}
    old_origins = {r['claimId']: r for r in prior_manifest['claimOrigins']}
    manifest['claimOrigins'] += [copy.deepcopy(old_origins.get(c['id'], {
        'claimId': c['id'], 'dataset': 'film-workflow-accepted' if context.get('sourceKind') == 'film-discovery-v1' else 'manga-workflow-accepted', 'sourceClaimId': c['id']}))
        for c in fixture['claims'] if c['id'] not in base_claim_ids]
    files = {'data.json': data, 'manifest.json': w.dump(manifest)}
    if release.exists():
        w.require(w.gate.inventory(release) == {name: w.gate.digest(content.encode()) for name, content in files.items()},
                  'Existing immutable release differs; use a new release ID')
    # Schema/closure check before a formal receipt is persisted; no real KG projection.
    with tempfile.TemporaryDirectory(prefix='acceptance-preflight-') as tmp:
        for name, content in files.items():
            (Path(tmp) / name).write_text(content, encoding='utf-8')
        w.node(['scripts/public-kg.ts', 'validate', tmp])
    # Catch altered decisions/evidence and concurrent KG changes before saving acceptance.
    w.require(w.gate.file_hash(args.decision) == args.decision_sha, 'Human decision changed during preparation')
    bundle(review, w)
    for row in prior_refs + observed['references']:
        checked_reference(row, w)
    _, latest = observe(args, w)
    check_public(expected, latest, args, w)
    w.require(latest == observed, 'Public snapshot changed during preparation')
    w.require(set(args.acceptances.resolve().glob('accepted-*/acceptance.json')) - {target / 'acceptance.json'}
              <= {p.resolve() for p in receipts}, 'Additional formal acceptances exist outside the reviewed comparison set')
    if continuation:
        sequence.verify_continuation(args, decision, w)
    if not receipt_exists:
        immutable_directory(target, immutable, w)
    try:
        release_unchanged = immutable_directory(release, files, w)
        code_root = Path(__file__).resolve().parents[1]
        validation_key = w.digest({'files': files, 'validator': w.gate.file_hash(code_root / 'lib/server/public-dataset.ts'),
                                  'schema': w.gate.file_hash(code_root / 'lib/domain/fixture.ts')})
        if context.get('sourceKind') == 'film-discovery-v1':
            validation_key = w.digest({'files': files, 'programs': context['programSha256']})
        cached = target / 'validation.json'
        validation_reused = cached.exists() and w.read(cached)['inputSha256'] == validation_key
        validation = w.read(cached)['result'] if validation_reused else w.node(['scripts/public-kg.ts', 'validate', str(release)])
        w.require(validation['valid'] is True, 'Public validation failed')
        if not validation_reused:
            w.gate.save(cached, {'inputSha256': validation_key, 'result': validation, 'checkedAt': w.gate.now()})
        _, before_plan = observe(args, w)
        check_public(expected, before_plan, args, w)
        w.require(before_plan == observed, 'Public state changed before plan')
        if getattr(args, 'production_backup', None):
            plan = w.node([str(Path(__file__).with_name('publication-backup-plan.ts')),
                           str(args.production_backup.resolve()), str(release), expected['revision']])
        else:
            plan = w.node(['scripts/public-kg.ts', 'plan', str(release)])  # Always rerun. Never apply/restore.
        _, after_plan = observe(args, w)
        check_public(expected, after_plan, args, w)
        w.require(before_plan == after_plan, 'Public state changed during plan; discard plan and review the new state')
        w.require(not plan.get('updated'), 'Unexpected updates to existing KG records')
        for name, content in files.items():
            w.require((release / name).read_text(encoding='utf-8') == content, 'Release changed during plan')
        for name, content in immutable.items():
            w.require((target / name).read_text(encoding='utf-8') == content, 'Acceptance changed during plan')
        w.require(w.gate.file_hash(args.decision) == args.decision_sha, 'Decision changed during plan')
        bundle(review, w)
        if continuation:
            sequence.verify_continuation(args, decision, w)
        for row in prior_refs + observed['references']:
            checked_reference(row, w)
        indexed, public_ids = w.index(fixture), w.index(public)
        reviewed = w.read(review / 'review.json')
        states = {f: {i: 'published-in-public-snapshot' if i in public_ids[f] else 'formally-accepted-not-applied' for i in indexed[f]}
                  for f in w.FIELDS}
        report = {'status': 'release-prepared-not-applied', 'decisionId': ident, 'acceptance': str(receipt_path),
                  'recordedAt': receipt['recordedAt'], 'checkedAt': w.gate.now(), 'releaseDirectory': str(release),
                  'acceptanceReused': receipt_exists, 'releaseUnchanged': release_unchanged, 'validationReused': validation_reused,
                  'acceptedCounts': receipt['counts'], 'reusedRecordIds': reused,
                  'releaseAdditions': {f: len(fixture[f]) - len(public[f]) for f in w.FIELDS},
                  'externalIdentifiersAdded': sum(len(e['externalIds']) for e in fixture['entities'] if e['id'] not in public_ids['entities']),
                  'notAcceptedRecordIds': {f: sorted(set(records[f]) - set(decision['acceptedRecordIds'][f])) for f in w.FIELDS},
                  'heldClaimIds': request['heldClaimIds'], 'heldEntityIds': request['heldEntityIds'],
                  'heldRecords': {f: [r for r in reviewed[f] if r['status'] == 'held'] for f in ['claims', 'entities']},
                  'inheritedHolds': reviewed['inheritedHolds'],
                  'validation': validation, 'plan': plan, 'publicBeforePlan': before_plan, 'publicAfterPlan': after_plan,
                  'explorationPaths': w.exploration_paths(indexed, states, set(decision['acceptedRecordIds']['claims']), set()),
                  'publicApply': False, 'applyAuthorized': NO_APPLY}
        if getattr(args, 'production_backup', None):
            report['planObservation'] = 'validated-production-backup-offline'
            report['liveVpsPlanPerformed'] = False
        w.gate.save(target / 'preparation.json', report)
        (target / 'preparation.md').write_text(report_markdown(report), encoding='utf-8')
        return report
    except Exception:
        failed = {'status': 'preparation-incomplete-not-applied', 'decisionId': ident,
            'acceptance': str(receipt_path), 'recordedAt': receipt['recordedAt'], 'checkedAt': w.gate.now(), 'publicApply': False,
            'notice': 'Human acceptance and completed immutable artifacts retained. Retry the same decision; plan is never reused.'}
        w.gate.save(target / 'preparation.json', failed)
        (target / 'preparation.md').write_text(report_markdown(failed), encoding='utf-8')
        raise


def execute(args, w):
    if args.command == 'decision-template':
        return template(args, w)
    # Check before creating the root's .lock, which must never contaminate frozen inputs.
    w.require(w.gate.file_hash(args.decision.resolve()) == args.decision_sha, 'Human decision hash mismatch')
    decision = w.read(args.decision.resolve())
    review = checked_reference(decision['review'], w).parent
    context, _, _, _ = bundle(review, w)
    protect_inputs([args.acceptances.resolve() / ('accepted-' + slug(decision['decisionId'], w)),
                    args.releases.resolve() / slug(decision['releaseId'], w)], review, context, w)
    # Serialize acceptance/release preparation in this root; manual sessions also retain the common project hold.
    with w.gate.locked(args.acceptances.resolve()):
        return accept(args, w)
