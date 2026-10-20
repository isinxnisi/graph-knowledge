"""Saved primary evidence -> the existing acceptance core. No collector, apply or restore."""
from contextlib import contextmanager
import copy
import fcntl
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

KIND = 'saved-evidence-v1'


def add_parsers(sub, root):
    for name in ['evidence-review', 'accept-evidence']:
        cli = sub.add_parser(name, help=__doc__)
        cli.add_argument('--data-root', type=Path, default=root, help='Existing data/receipt root; programs always come from this checkout')
        cli.add_argument('--production-backup', type=Path, required=True)
        cli.add_argument('--backup-sha', required=True)
        cli.add_argument('--public-origin', required=True)
        if name == 'evidence-review':
            cli.add_argument('--binding', type=Path, required=True)
            cli.add_argument('--binding-sha', required=True)
            cli.add_argument('--raw-evidence', type=Path, required=True)
            cli.add_argument('--encoding', choices=['utf-8', 'shift_jis'], default='shift_jis')
            cli.add_argument('--output', type=Path, required=True)
            cli.add_argument('--decision-output', type=Path, required=True)
            cli.add_argument('--decision-id', required=True)
            cli.add_argument('--release', required=True)
        else:
            cli.add_argument('--decision', type=Path, required=True)
            cli.add_argument('--decision-sha', required=True)
            cli.add_argument('--worker-home', type=Path, required=True, help='Installed Worker: require its lock and an active manual common hold')
            cli.add_argument('--manual-lock-token', required=True)


def core(w):
    return w.load('evidence_acceptance_core', Path(__file__).with_name('collection-acceptance.py'))


def program_hashes(w):
    names = ['scripts/collection-workflow.py', 'scripts/collection-acceptance.py', 'scripts/collection-evidence.py',
             'scripts/publication-backup-plan.ts', 'lib/server/public-backup.ts', 'lib/server/public-dataset.ts', 'lib/domain/fixture.ts']
    return {name: w.gate.file_hash(w.CODE_ROOT / name) for name in names}


def rooted(value, w):
    path = Path(value)
    path = path if path.is_absolute() else w.ROOT / path
    w.require(not path.is_symlink() and path.resolve().is_relative_to(w.ROOT.resolve()), 'Evidence/reference must remain in the data root')
    return path.resolve()


def checked(row, w, parent=None):
    w.require(set(row) == {'file', 'sha256'}, 'Explicit evidence file/hash required')
    path = rooted((parent / row['file']) if parent else row['file'], w)
    w.require(w.gate.file_hash(path) == row['sha256'], 'Saved evidence/reference hash differs: ' + str(path))
    return path


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def live_metadata(origin, w):
    parsed = urlsplit(origin)
    w.require(parsed.scheme == 'https' and parsed.hostname and parsed.path in ['', '/']
              and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment,
              'An HTTPS production origin is required')
    url = origin.rstrip('/') + '/api/dataset'
    with build_opener(NoRedirect()).open(Request(url, headers={'Accept': 'application/json'}), timeout=15) as response:
        w.require(response.status == 200 and response.geturl() == url, 'Production metadata status/URL differs')
        body = response.read(65537)
    w.require(len(body) <= 65536, 'Production metadata response too large')
    data = json.loads(body, object_pairs_hook=w.gate.unique_keys)
    w.require(set(data) == {'dataset', 'revision'} and data['dataset'] == 'public-kg', 'Unexpected production metadata')
    return {'url': url, 'httpStatus': 200, **data}


def observe(args, w):
    w.require(w.gate.file_hash(args.production_backup.resolve()) == args.backup_sha, 'Production backup hash differs')
    public, context = w.public_snapshot(args.production_backup.resolve())
    metadata = live_metadata(args.public_origin, w)
    w.require(metadata['revision'] == context['revision'], 'Production revision differs from validated backup')
    context.update(productionBackupSha256=args.backup_sha, liveMetadata=metadata)
    # Keep the existing supplied-backup label. This is never called a live DB backup/plan.
    return public, context


def frozen(binding_ref, raw_ref, encoding, public, w):
    binding_path = checked(binding_ref, w)
    binding = w.read(binding_path)
    w.require(binding['schemaVersion'] == 1 and binding['formalAcceptanceExecuted'] is False
              and binding['applyAuthorized'] == {'local': False, 'beta': False, 'vps': False}, 'Unsupported saved-evidence binding')
    proposal_path = checked(binding['proposal'], w, binding_path.parent)
    approval_path = checked(binding['approvalRecord'], w, binding_path.parent)
    approval, proposal = w.read(approval_path), w.read(proposal_path)
    w.require(w.gate.digest(approval['body'].encode('utf-8')) == approval['bodySha256'], 'Original human approval body differs')
    records = proposal['records']
    w.require(set(records) == set(w.FIELDS) and not records['entities']
              and all(len(records[f]) == 1 for f in ['claims', 'sources', 'citations']), 'Saved-evidence v1 accepts one Claim and its new Source/Citation only')
    w.index(records)
    w.require(binding['recordSha256'] == {f: {r['id']: w.digest(r) for r in records[f]} for f in w.FIELDS}, 'Frozen UUID/record body differs')
    a = core(w)
    w.require(binding['scopeByClaim'] == a.scope_rows(records, w), 'Frozen meaning/endpoints/Role/scope differs')
    for claim in records['claims']:
        w.require(claim['visibility'] == 'hidden', 'Unaccepted evidence Claim must remain hidden')
    known = w.index(public)
    for dependency in binding['existingEntityDependencies']:
        w.require(dependency['entityId'] in known['entities']
                  and w.digest(known['entities'][dependency['entityId']]) == dependency['recordSha256'], 'Existing endpoint dependency differs')
    evidence = binding['evidence']
    report = w.read(checked({'file': evidence['reviewFile'], 'sha256': evidence['reviewSha256']}, w))
    w.require(report['schemaVersion'] == 1 and report['reportType'] == 'single-authorized-get-evidence-review-not-acceptance',
              'Unsupported saved primary evidence report')
    acquisition, recommendation = report['acquisition'], report['reviewRecommendation']
    claim, source = records['claims'][0], records['sources'][0]
    w.require(acquisition['requestedUrl'] == acquisition['effectiveUrl'] == source['url']
              and acquisition['httpStatus'] == evidence['httpStatus'] == 200
              and acquisition['curlExitCode'] == 0 and acquisition['bodyComplete'] is True and acquisition['redirectCount'] == 0
              and acquisition['bodySha256'] == evidence['bodySha256']
              and acquisition['finishedAtUtc'] == evidence['retrievedAt'], 'Pinned primary acquisition/Source differs')
    w.require(claim['subjectId'] == recommendation['subjectEntityId'] and claim['objectId'] == recommendation['targetEntityId']
              and claim['predicate'] == recommendation['predicateUnderReview'] and claim['polarity'] == recommendation['polarityUnderReview']
              and claim['contribution'] == {'roleId': recommendation['roleIdUnderReview'], 'scope': recommendation['scopeUnderReview']}
              and claim['period'] == recommendation['periodUnderReview'], 'Pinned semantic review differs from frozen Claim')
    raw_path = checked(raw_ref, w)
    body = raw_path.read_bytes()
    w.require(0 < len(body) <= 2 * 1024 * 1024 and w.gate.digest(body) == evidence['bodySha256']
              and evidence['httpStatus'] == 200, 'Original primary evidence body/hash/status differs')
    start, end = evidence['bodyByteRange']
    w.require(isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(body), 'Invalid raw evidence byte locator')
    excerpt = body[start:end].decode(encoding, errors='strict')
    w.require(excerpt == evidence['contextExcerpt'] and evidence['originalText'] in excerpt
              and body[:start].count(b'\n') + 1 == evidence['sourceHtmlLine'], 'Original quote/context/line differs')
    w.require(len(body) == acquisition['savedBodyBytes'] and report['evidence']['originalRoleText'] == evidence['originalText']
              and report['evidence']['language'] == evidence['language']
              and report['evidence']['contextExcerpt'] == excerpt, 'Pinned body size/original evidence differs')
    locator = report['evidence']['locator']
    w.require(locator['sourceHtmlLine'] == evidence['sourceHtmlLine']
              and [locator['excerptByteStart'], locator['excerptByteEndExclusive']] == [start, end], 'Pinned raw locator differs')
    citation = records['citations'][0]
    w.require(citation['claimId'] == records['claims'][0]['id'] and citation['sourceId'] == records['sources'][0]['id']
              and citation['stance'] == 'support'
              and citation['roleEvidence'] == {'originalText': evidence['originalText'], 'language': evidence['language']}, 'Approved supporting Citation differs')
    refs = [w.reference(p) for p in [binding_path, proposal_path, approval_path]]
    refs.append({'file': evidence['reviewFile'], 'sha256': evidence['reviewSha256']})
    return binding, records, refs


def bundle(directory, w):
    manifest = w.read(directory / 'review-manifest.json')
    w.require(manifest['schemaVersion'] == 1 and manifest['authority'] == 'pending-human-review-only'
              and manifest['sourceKind'] == KIND, 'Unsupported saved-evidence review')
    actual = w.gate.inventory(directory)
    w.require(actual == {**manifest['artifacts'], 'review-manifest.json': w.gate.file_hash(directory / 'review-manifest.json')}, 'Saved-evidence review inventory differs')
    context, request = w.read(directory / 'context.json'), w.read(directory / 'decision-request.json')
    w.require(context['sourceKind'] == KIND and context['dataRoot'] == str(w.ROOT.resolve())
              and w.digest(context) == manifest['inputSha256'] and request['status'] == 'pending-human-decision', 'Saved-evidence context differs')
    w.require(context['programSha256'] == program_hashes(w), 'Reviewed acceptance program changed')
    public = w.read(w.ROOT / 'datasets/public-kg/releases' / context['public']['release'] / 'data.json')
    binding, records, refs = frozen(context['binding'], context['rawEvidence'], context['encoding'], public, w)
    w.require(context['frozenReferences'] == refs and w.read(directory / 'proposed-records.json')['records'] == records, 'Frozen records/references differ')
    w.require(context['public']['release'] == binding['baseRelease'] and context['public']['revision'] == binding['baseRevision'], 'Saved-evidence production base differs')
    for row in context['public']['references'] + refs:
        checked(row, w)
    for file, sha in context['acceptedReferences']:
        checked({'file': file, 'sha256': sha}, w)
    ids = {f: [r['id'] for r in records[f]] for f in w.FIELDS}
    w.require(request['groups']['normal']['recordIds'] == ids and not request['heldClaimIds']
              and not request['heldEntityIds'], 'Saved-evidence group differs')
    w.require(not w.read(directory / 'review.json')['recordConflicts'], 'Unresolved saved-evidence conflict')
    return context, request, w.index(records), [w.reference(directory / name) for name in sorted(actual)] + refs


def review(args, w):
    a = core(w)
    public, observed = observe(args, w)
    raw_path = rooted(args.raw_evidence, w)
    binding_path = rooted(args.binding, w)
    binding_ref = {'file': w.reference(binding_path)['file'], 'sha256': args.binding_sha}
    raw_ref = w.reference(raw_path)
    binding, records, refs = frozen(binding_ref, raw_ref, args.encoding, public, w)
    w.require(binding['baseRelease'] == observed['release'] and binding['baseRevision'] == observed['revision'], 'Approved base differs from production backup')
    prior, prior_refs = w.discover_accepted()
    # Existing duplicate/closure/URL/identity checks, before creating any acceptance.
    _, reused = a.merge(public, prior, records, w)
    w.require(not any(reused.values()), 'Saved-evidence records already exist; do not reaccept')
    context = {'sourceKind': KIND, 'dataRoot': str(w.ROOT.resolve()), 'evidenceDirectory': str(binding_path.parent),
               'binding': binding_ref, 'rawEvidence': raw_ref, 'encoding': args.encoding, 'public': observed,
               'acceptedReferences': prior_refs, 'frozenReferences': refs, 'programSha256': program_hashes(w)}
    request = {'status': 'pending-human-decision', 'groups': {'normal': {'recordIds': {f: [r['id'] for r in records[f]] for f in w.FIELDS}}},
               'heldClaimIds': [], 'heldEntityIds': []}
    files = {'context.json': w.dump(context), 'decision-request.json': w.dump(request),
             'proposed-records.json': w.dump({'records': records}),
             'review.json': w.dump({'recordConflicts': [], 'claims': [], 'entities': [], 'inheritedHolds': []})}
    files['review-manifest.json'] = w.dump({'schemaVersion': 1, 'sourceKind': KIND, 'authority': 'pending-human-review-only',
        'inputSha256': w.digest(context), 'artifacts': {n: w.gate.digest(v.encode()) for n, v in files.items()}})
    target = rooted(args.output, w)
    args.decision_output = rooted(args.decision_output, w)
    a.protect_inputs([target, args.decision_output], binding_path.parent, context, w)
    a.immutable_directory(target, files, w)
    draft = a.template(SimpleNamespace(review=target, group='normal', claim_id=[], decision_id=args.decision_id,
        release=args.release, output=args.decision_output), w)
    return {'reviewDirectory': str(target), **draft, 'sourceKind': KIND, 'publicObservation': observed}


@contextmanager
def worker_guard(args, w):
    home = args.worker_home.resolve()
    w.require(w.ROOT.resolve() == home / 'runtime' and args.manual_lock_token, 'Installed data root and manual common hold required')
    subprocess.run([sys.executable, str(w.CODE_ROOT / 'scripts/autopilot.py'), 'assert-held', '--token', args.manual_lock_token], check=True)
    config = w.read(home / 'config.json')
    w.require(config['home'] == str(home) and config['codeCommit'] and config['workerId'], 'Installed Worker identity/config required')
    with (home / 'worker.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        control = w.read(home / 'state.json')['executionControl']
        w.require(not control.get('activeAttempt') and not control.get('pauseMode') and not control.get('controlError')
                  and not control.get('error'), 'Worker/publication is paused, active or has a control error')
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def execute(args, w):
    if args.command == 'evidence-review':
        return review(args, w)
    a = core(w)
    args.acceptances = w.ROOT / 'datasets/manga-collection'
    args.releases = w.ROOT / 'datasets/public-kg/releases'
    args.continuation = args.continuation_sha = None
    w.require(w.gate.file_hash(args.decision) == args.decision_sha, 'Human decision hash differs')
    decision = w.read(args.decision)
    w.require(decision.get('sourceKind') == KIND, 'Saved-evidence human decision required')
    with worker_guard(args, w):
        for path in args.acceptances.glob('accepted-*/acceptance.json'):
            receipt = w.read(path)
            if receipt.get('decisionId') == decision['decisionId']:
                continue
            w.require(not any(set(receipt['acceptedRecordIds'][f]) & set(decision['acceptedRecordIds'][f]) for f in w.FIELDS),
                      'Selected UUID is owned by another formal receipt; do not reaccept')
        return a.execute(args, w)
