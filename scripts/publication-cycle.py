#!/usr/bin/env python3
"""Read-only publication synchronization and candidate drafts. No production execution command."""
import argparse
import hashlib
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
FIELDS = ('entities', 'claims', 'sources', 'citations')
PRODUCTION = 'https://plunode.net'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def require(condition, message):
    if not condition: raise ValueError(message)


def read(path): return json.loads(path.read_text(encoding='utf-8'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def dump(value): return json.dumps(value, ensure_ascii=False, indent=2) + '\n'
def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def sealed_bundle(bundle, expected):
    sums = bundle / 'SHA256SUMS'
    require(not sums.is_symlink(), 'Checksum manifest symlink')
    require(sha(sums) == expected, 'Published bundle checksum manifest differs')
    pins = {sums: expected}
    for line in sums.read_text().splitlines():
        checksum, name = line.split('  ', 1); path = Path(name)
        require(re.fullmatch('[0-9a-f]{64}', checksum) and not path.is_absolute()
                and '..' not in path.parts and '\\' not in name, 'Unsafe bundle reference')
        target = bundle / path
        require(not any(p.is_symlink() for p in [target, *target.parents]) and target.is_file(), 'Bundle symlink/missing file')
        require(target not in pins and sha(target) == checksum, 'Bundle content differs')
        pins[target] = checksum
    require(set(pins) == {p for p in bundle.rglob('*') if p.is_file()}, 'Unexpected bundle file')
    return read(bundle / 'publication.json'), pins


def getter():
    cache = {}
    def get(path):
        if path != '/api/dataset' and path in cache: return cache[path]
        with urlopen(PRODUCTION + path, timeout=20) as response: result = json.load(response)
        if path != '/api/dataset': cache[path] = result
        return result
    return get


def partition(accepted, public, w):
    known = w.index(public); published = {f: {} for f in FIELDS}; pending = {f: {} for f in FIELDS}
    for field in FIELDS:
        for ident, row in accepted[field].items():
            require(not any(ident in known[other] for other in FIELDS if other != field), 'Published UUID type differs')
            if ident in known[field]:
                require(known[field][ident] == row, 'Published UUID meaning/withdrawal differs: ' + ident)
                published[field][ident] = row
            else: pending[field][ident] = row
    return published, pending


def audit(args, get=None, w=None):
    require(__debug__, 'Optimized Python disables existing API assertions; run without -O/PYTHONOPTIMIZE')
    runtime, bundle = args.runtime.resolve(), args.published_bundle.resolve()
    w = w or load('cycle_workflow', runtime / 'scripts/collection-workflow.py')
    report, pins = sealed_bundle(bundle, args.bundle_sha)
    fixture, manifest = read(bundle / 'release/data.json'), read(bundle / 'release/manifest.json')
    require(manifest['release'] == report['release'] and sha(bundle / 'release/data.json') == report['dataSha256']
            and sha(bundle / 'release/manifest.json') == report['manifestSha256'], 'Published release binding differs')
    # Validate formal acceptance from original reviewed records, not from a visibility flag or API name.
    original = []
    for ref in report['adoptedReceipts']:
        p = Path(ref['file'])
        require(not p.is_absolute() and '..' not in p.parts, 'Unsafe receipt reference')
        p = runtime / p
        require(sha(p) == ref['sha256'], 'Adopted receipt differs')
        original.append(p)
    require(w.digest(report['adoptedReceipts']) == report['receiptSetSha256'], 'Published receipt set differs')
    extra, _ = w.accepted_additions(bundle / 'release', original)
    sequence = w.load('cycle_sequence', runtime / 'scripts/collection-sequence.py')
    register = sequence.register(bundle / 'evidence/approval-register.json', report['registerSha256'], w)
    for batch in register['batchDecisions']:
        decision = batch['envelope']['decision']
        if decision['decisionId'] in report['acceptedIssue25Decisions']:
            require(sequence.saved_receipt(decision, w), 'Published approval lacks formal receipt')
    receipts = sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    receipt_refs = [w.reference(p) for p in receipts]
    inventory = w.load('cycle_inventory', runtime / 'scripts/collection-inventory.py')
    inv = inventory.Inventory(w, [('runtime', runtime)], fixture, {'release': manifest['release'], 'revision': args.revision})
    inv.formal_receipts()
    require(len(inv.receipts) == len({sha(p) for p in receipts}), 'Formal receipt inventory incomplete')
    require(not inv.issues, 'Formal receipt integrity failure: ' + str(inv.issues))
    published, pending = partition(inv.accepted, fixture, w)
    # Reuse the existing identity/dependency checks, without accepting anything or creating a release.
    acceptance = w.load('cycle_acceptance', runtime / 'scripts/collection-acceptance.py')
    merged, _ = acceptance.merge(fixture, {f: list(inv.accepted[f].values()) for f in FIELDS}, {f: [] for f in FIELDS}, w)
    for claim in pending['claims'].values():
        require(any(c['claimId'] == claim['id'] and c['stance'] == 'support' for c in merged['citations']), 'Pending Claim lacks support')
    get = get or getter()
    expected = {'dataset': 'public-kg', 'revision': args.revision}
    require(get('/api/dataset') == expected, 'Production revision changed before synchronization')
    smoke = load('cycle_smoke', ROOT / 'scripts/verify-publication.py')
    cases = read(bundle / 'verification-cases.json')
    require({c['claimId'] for c in cases} == {c['id'] for c in extra['claims']}, 'Incomplete published Claim verification cases')
    verification = smoke.verify(cases, args.revision, get, all_claims=True)
    entity_ids = {e['id'] for e in extra['entities']}
    entities = w.index(fixture)['entities']
    for ident in sorted(entity_ids):
        got = get('/api/entities/' + ident)['entity']; row = entities[ident]
        require(got == {k: row.get(k) for k in ['id', 'kind', 'name', 'description', 'aliases', 'event']}, 'Published Entity projection differs')
    require(get('/api/dataset') == expected, 'Production revision changed during synchronization')
    for path, checksum in inv.readset.items(): pins[path] = checksum
    for path in receipts: pins[path] = sha(path)
    ledger = {'schemaVersion': 1, 'authority': 'read-only-observation-not-acceptance-or-publication-approval',
        'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'environment': 'production', 'apiOrigin': PRODUCTION, 'release': manifest['release'], 'revision': args.revision,
        'publishedDataSha256': report['dataSha256'], 'publishedManifestSha256': report['manifestSha256'],
        'receiptSetSha256': w.digest(receipt_refs), 'receipts': receipt_refs,
        'published': {f: sorted(published[f]) for f in FIELDS}, 'pending': {f: sorted(pending[f]) for f in FIELDS},
        'counts': {'publishedAccepted': {f: len(published[f]) for f in FIELDS}, 'acceptedUnpublished': {f: len(pending[f]) for f in FIELDS}},
        'verification': {'claims': len(verification['verified']), 'entities': len(entity_ids), 'allAcceptedEvidenceChecked': True,
            'observation': 'revision-bound-public-api-projections-and-immutable-applied-artifact',
            'liveWholeGraphBackupVerified': False, 'entityTimestampsAndExternalIdsExposedByApi': False,
            'fullCountsFromArtifactOnly': {f: len(fixture[f]) for f in FIELDS}},
        'nextBaseRelease': manifest['release'], 'nextBaseRevision': args.revision,
        'productionExecutionEnabled': False,
        'status': 'up-to-date' if not any(pending[f] for f in FIELDS) else 'pending-requires-current-backup-and-live-plan'}
    return ledger, verification, pins, (w, inv, fixture, pending, receipt_refs)


def candidate(args, ledger, context, staging):
    w, inv, fixture, pending, receipt_refs = context
    require(args.release != ledger['release'], 'Release ID already published; do not reapply')
    if not any(pending[f] for f in FIELDS): return {'status': 'up-to-date', 'candidateCreated': False, 'productionExecutionEnabled': False}
    require(args.release and re.fullmatch('[a-z0-9][a-z0-9-]*', args.release), 'A new release ID is required')
    require(args.public_backup, 'A current validated VPS KG backup is required; API projections are insufficient')
    public, observed = w.public_snapshot(args.public_backup.resolve())
    require((observed['release'], observed['revision']) == (ledger['release'], ledger['revision']), 'Backup is stale')
    require(w.index(public) == w.index(fixture), 'Current backup differs from the sealed published fixture')
    for name, key in [('data.json', 'publishedDataSha256'), ('manifest.json', 'publishedManifestSha256')]:
        require(sha(w.ROOT / 'datasets/public-kg/releases' / ledger['release'] / name) == ledger[key],
                'Runtime published artifact differs')
    payload = read(args.public_backup)['payload']
    require(args.release not in {r['id'] for r in payload['receipts']}, 'Release ID already used')
    sequence = w.load('cycle_prepare_sequence', w.ROOT / 'scripts/collection-sequence.py')
    comparison, additions, refs, _ = sequence.receipt_projection(public, observed, staging / 'scratch', w)
    require(all({r['id'] for r in additions[f]} == set(pending[f]) for f in FIELDS), 'Publication delta is not exactly unpublished formal records')
    data = (comparison / 'data.json').read_text()
    manifest = w.read(comparison / 'manifest.json')
    manifest.update(release=args.release, baseRelease=ledger['release'], reason='正式受入済み未公開レコードのみの公開候補。公開承認・実行は別ゲート。')
    release = staging / 'release'; release.mkdir()
    (release / 'data.json').write_text(data); (release / 'manifest.json').write_text(w.dump(manifest))
    validation = w.node(['scripts/public-kg.ts', 'validate', str(release)])
    require(validation['valid'], 'Candidate validation failed')
    plan = w.node([str(ROOT / 'scripts/publication-backup-plan.ts'), str(args.public_backup.resolve()), str(release), ledger['revision']])
    require(not plan['updated'] and plan['added'], 'No-op or existing update is not a publication candidate')
    shutil.rmtree(staging / 'scratch')
    for path, checksum in inv.readset.items():
        relative = path.relative_to(w.ROOT)
        target = staging / 'evidence' / relative
        target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(path, target)
        require(sha(target) == checksum, 'Evidence changed while freezing')
    (staging / 'offline-plan.json').write_text(dump(plan))
    request = {'schemaVersion': 1, 'purpose': 'public-kg-publication', 'environment': 'production',
        'release': args.release, 'baseRelease': ledger['release'], 'baseRevision': ledger['revision'],
        'receiptSetSha256': ledger['receiptSetSha256'], 'planSha256': digest(plan),
        'operatorDigest': args.operator_digest, 'artifactSha256': None}
    # The manifest commits to all execution input bytes; approval JSON is outside its own hash.
    assets = {p.relative_to(staging).as_posix(): sha(p) for p in sorted(staging.rglob('*')) if p.is_file()}
    (staging / 'ARTIFACT.json').write_text(dump(assets)); request['artifactSha256'] = sha(staging / 'ARTIFACT.json')
    (staging / 'approval-request.json').write_text(dump(request))
    return {'status': 'awaiting-live-preflight-and-operator-release', 'candidateCreated': True,
        'release': args.release, 'offlinePlanOnly': True, 'productionExecutionEnabled': False,
        'blocking': ['Fresh root-owned live preflight receipt and supported pinned operator image', 'Trusted signed single-use publication approval; execution gate not deployed']}


def validate_pending_ledger(ledger, fixture, before=None):
    """API coverage is execution input; reject omissions before any publication reservation/apply."""
    pending = ledger.get('pending')
    counts = ledger.get('counts', {}).get('acceptedUnpublished')
    require(isinstance(pending, dict) and set(pending) == set(FIELDS)
            and isinstance(counts, dict) and set(counts) == set(FIELDS), 'Pending verification ledger is missing/incomplete')
    for field in FIELDS:
        ids = pending[field]
        require(isinstance(ids, list) and all(isinstance(i, str) for i in ids)
                and len(ids) == len(set(ids)) and type(counts[field]) is int and counts[field] == len(ids),
                'Pending verification IDs/counts differ')
        records = {row['id']: row for row in fixture[field]}
        require(set(ids) <= set(records), 'Pending verification record is missing from the release')
        if before is not None:
            old = {row['id']: row for row in before[field]}
            require(all(records.get(i) == row for i, row in old.items()), 'Pending verification base has existing changes/removals')
            require(set(ids) == set(records) - set(old), 'Pending verification differs from actual unpublished delta')


def verify_prepared_artifact(directory):
    request = read(directory / 'approval-request.json')
    require(sha(directory / 'ARTIFACT.json') == request['artifactSha256'], 'Prepared artifact manifest differs')
    assets = read(directory / 'ARTIFACT.json')
    metadata = {'ARTIFACT.json', 'approval-request.json', 'result.json', 'source-hashes.json'}
    for name, checksum in assets.items():
        relative = Path(name)
        require(not relative.is_absolute() and '..' not in relative.parts and '\\' not in name
                and name not in metadata and re.fullmatch('[a-f0-9]{64}', checksum), 'Unsafe prepared asset')
        path = directory / relative
        require(not any(p.is_symlink() for p in [path, *path.parents]) and path.is_file()
                and sha(path) == checksum, 'Prepared asset differs')
    actual = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file() or p.is_symlink()}
    require(not any(p.is_symlink() for p in directory.rglob('*')), 'Prepared symlink')
    require(actual - metadata == set(assets), 'Unexpected prepared asset')
    require(digest(read(directory / 'offline-plan.json')) == request['planSha256'], 'Prepared plan differs')
    validate_pending_ledger(read(directory / 'ledger.json'), read(directory / 'release/data.json'))
    return request


def execute(args, get=None, w=None):
    output = args.output.resolve()
    protected = [args.runtime.resolve(), args.published_bundle.resolve(), ROOT / 'datasets', ROOT / 'scripts', ROOT / '.git', ROOT / '.local']
    if args.runtime.resolve().name == 'runtime': protected.append(args.runtime.resolve().parent)
    if args.public_backup: protected.append(args.public_backup.resolve())
    require(not any(output == p or output.is_relative_to(p) or p.is_relative_to(output) for p in protected), 'Output overlaps a protected input')
    require(not output.exists(), 'Never overwrite an existing observation')
    backup_pin = sha(args.public_backup.resolve()) if args.public_backup else None
    get = get or getter()
    ledger, verification, pins, context = audit(args, get, w)
    if args.public_backup:
        pins[args.public_backup.resolve()] = backup_pin
        for name in ['data.json', 'manifest.json']:
            p = args.runtime.resolve() / 'datasets/public-kg/releases' / ledger['release'] / name
            pins[p] = sha(p)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.publication-cycle-', dir=output.parent) as tmp:
        stage = Path(tmp) / 'result'; stage.mkdir()
        (stage / 'ledger.json').write_text(dump(ledger))
        (stage / 'api-verification.json').write_text(dump(verification))
        if args.command == 'prepare': result = candidate(args, ledger, context, stage)
        else: result = {'status': ledger['status'], 'productionExecutionEnabled': False}
        if result.get('candidateCreated'): verify_prepared_artifact(stage)
        (stage / 'result.json').write_text(dump(result))
        (stage / 'source-hashes.json').write_text(dump({str(p): s for p, s in pins.items()}))
        require(get('/api/dataset') == {'dataset': 'public-kg', 'revision': args.revision}, 'Production advanced before observation commit')
        for p, checksum in pins.items(): require(sha(p) == checksum, 'Input changed during synchronization')
        w = context[0]
        require(ledger['receipts'] == [w.reference(p) for p in sorted((args.runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))], 'Receipt set advanced; resynchronize')
        stage.rename(output)
    return {'output': str(output), **result, 'counts': ledger['counts']}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('command', choices=['sync', 'prepare'])
    cli.add_argument('--runtime', type=Path, required=True)
    cli.add_argument('--published-bundle', type=Path, required=True)
    cli.add_argument('--bundle-sha', required=True, help='Trusted SHA-256 of the published bundle SHA256SUMS')
    cli.add_argument('--revision', required=True)
    cli.add_argument('--output', type=Path, required=True)
    cli.add_argument('--release')
    cli.add_argument('--public-backup', type=Path)
    cli.add_argument('--operator-digest')
    args = cli.parse_args()
    require(not hasattr(os, 'geteuid') or os.geteuid() != 0, 'Run as an unprivileged user; runtime code is never root-trusted')
    print(dump(execute(args)), end='')


if __name__ == '__main__': main()
