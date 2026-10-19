#!/usr/bin/env python3
"""Freeze an existing receipt-covered release for operator review. Never accepts or applies data."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
BASELINE_RECEIPTS = {'accepted-r0002-20261017', 'accepted-original-story-r0002-20261017', 'accepted-r0003-20261017'}


def load(path):
    spec = importlib.util.spec_from_file_location('publication_workflow', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def prepare(args, w=None):
    runtime, output = args.runtime.resolve(), args.output.resolve()
    w = w or load(runtime / 'scripts/collection-workflow.py')
    w.require(not output.exists() and not output.is_relative_to(runtime), 'Use a new bundle outside Worker runtime')
    release = runtime / 'datasets/public-kg/releases' / args.release
    w.require(release.parent == runtime / 'datasets/public-kg/releases', 'Invalid release ID')
    receipts = sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))
    pinned = [w.reference(p) for p in receipts]
    backup_sha = w.gate.file_hash(args.public_backup.resolve())
    public, observed = w.public_snapshot(args.public_backup.resolve())
    sequence = w.load('publication_sequence', runtime / 'scripts/collection-sequence.py')
    register = sequence.register(args.register.resolve(), args.register_sha, w)
    allowed = BASELINE_RECEIPTS | {'accepted-' + b['envelope']['decision']['decisionId'] for b in register['batchDecisions']}
    actual = {p.parent.name for p in receipts}
    w.require(BASELINE_RECEIPTS <= actual <= allowed, 'Unexpected/missing formal receipt outside existing baseline and approved register')
    for name in BASELINE_RECEIPTS:
        w.require(w.gate.file_hash(runtime / 'datasets/manga-collection' / name / 'acceptance.json') ==
                  w.gate.file_hash(ROOT / 'datasets/manga-collection' / name / 'acceptance.json'), 'Historical formal receipt differs')
    verified = []
    for batch in register['batchDecisions']:
        decision = batch['envelope']['decision']
        saved = sequence.saved_receipt(decision, w)
        if saved:
            verified.append(decision['decisionId'])
    inventory = w.load('publication_inventory', runtime / 'scripts/collection-inventory.py')
    check = inventory.Inventory(w, [('runtime', runtime)], public, observed)
    check.formal_receipts()
    w.require(not check.issues, 'Invalid formal receipt: ' + str(check.issues))
    additions, refs = w.accepted_additions(release, receipts)
    manifest, fixture = w.read(release / 'manifest.json'), w.read(release / 'data.json')
    w.require(manifest['baseRelease'] == observed['release'], 'Publication base differs from supplied observation')
    w.require(manifest.get('withdrawals', []) == observed.get('withdrawals', []), 'Withdrawal changes need separate review')
    w.require(w.read(runtime / 'datasets/public-kg/releases' / observed['release'] / 'data.json') == public,
              'Supplied public observation differs from base artifact')
    w.require(all({r['id']: r for r in additions[f]} == check.accepted[f] for f in w.FIELDS),
              'Candidate must contain exactly the adopted formally accepted records')
    unique = {}
    for ref in [{'file': file, 'sha256': sha} for file, sha in refs] + observed.get('references', []) + pinned + [w.reference(args.register.resolve())]:
        path = Path(ref['file'])
        source = path if path.is_absolute() else runtime / path
        # The approval register can live outside runtime. Other evidence stays in its original root.
        name = 'approval-register.json' if source.resolve() == args.register.resolve() else ref['file']
        w.require(not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe evidence path')
        w.require(name not in unique or unique[name][1] == ref['sha256'], 'Conflicting evidence hash')
        unique[name] = (source, ref['sha256'])
    # Include the immutable decision/selection manifests in addition to the legacy receipt references.
    for receipt in receipts:
        for name in ['acceptance-manifest.json', 'decision.json', 'accepted-records.json']:
            path = receipt.parent / name
            if path.exists(): unique[path.relative_to(runtime).as_posix()] = (path, w.gate.file_hash(path))
    base_ids = {f: {r['id'] for r in public[f]} for f in w.FIELDS}
    delta = {f: len(fixture[f]) - len(public[f]) for f in w.FIELDS}
    external = lambda data: {(x['namespace'], x['value']) for entity in data['entities'] for x in entity['externalIds']}
    extra_ids = len(external(fixture) - external(public))
    known = w.index(fixture)
    cases = []
    for claim in fixture['claims']:
        if claim['id'] in base_ids['claims']: continue
        citations = [c for c in fixture['citations'] if c['claimId'] == claim['id']]
        cases.append({'claimId': claim['id'], 'subjectId': claim['subjectId'], 'subject': known['entities'][claim['subjectId']]['name'],
            'objectId': claim['objectId'], 'object': known['entities'][claim['objectId']]['name'],
            'predicate': claim['predicate'], 'polarity': claim['polarity'], 'period': claim['period'],
            'contribution': claim.get('contribution'), 'citations': citations,
            'sources': [known['sources'][c['sourceId']] for c in citations], 'expectedAfterPublication': True})
    report = {'schemaVersion': 1, 'authority': 'publication-preparation-only-not-apply-approval',
        'release': args.release, 'baseRelease': manifest['baseRelease'], 'observation': observed,
        'adoptedReceipts': pinned, 'registerSha256': args.register_sha, 'publicBackupSha256': backup_sha, 'acceptedIssue25Decisions': verified,
        'receiptSetSha256': w.digest(pinned),
        'externalIdentifiersAdded': extra_ids, 'expectedAddedNodes': sum(delta.values()) + extra_ids,
        'expectedRelationshipsAdded': 2 * delta['claims'] + 2 * delta['citations'] + extra_ids,
        'issue25Complete': len(verified) == len(register['batchDecisions']), 'additions': delta,
        'dataSha256': manifest['dataSha256'], 'manifestSha256': w.gate.file_hash(release / 'manifest.json'),
        'evidenceSha256': {k: v[1] for k, v in unique.items()}, 'publicApply': False}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.publication-', dir=output.parent) as temporary:
        staging = Path(temporary) / 'bundle'; staging.mkdir()
        for name in ['data.json', 'manifest.json']:
            target = staging / 'release' / name; target.parent.mkdir(exist_ok=True); shutil.copyfile(release / name, target)
            w.require(w.gate.file_hash(target) == w.gate.file_hash(release / name), 'Release changed while copying')
        for name, (source, sha) in unique.items():
            target = staging / 'evidence' / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(source, target)
            w.require(w.gate.file_hash(target) == sha and w.gate.file_hash(source) == sha, 'Evidence changed during freeze')
        (staging / 'publication.json').write_text(w.dump(report), encoding='utf-8')
        (staging / 'verification-cases.json').write_text(w.dump(cases), encoding='utf-8')
        for name in ['publication-backup-plan.ts', 'publication-operator.sh', 'verify-publication.py']:
            source = ROOT / 'scripts' / name
            w.require(source.is_file(), 'Required operator helper missing')
            target = staging / 'scripts' / name; target.parent.mkdir(exist_ok=True); shutil.copyfile(source, target)
        shutil.copyfile(ROOT / 'docs/runbooks/PUBLISH_ACCEPTED_KG.md', staging / 'README.md')
        target = staging / 'compat/contribution.ts'; target.parent.mkdir(); shutil.copyfile(ROOT / 'lib/domain/contribution.ts', target)
        sums = ''.join(w.gate.file_hash(p) + '  ' + p.relative_to(staging).as_posix() + '\n'
                       for p in sorted(staging.rglob('*')) if p.is_file())
        (staging / 'SHA256SUMS').write_text(sums, encoding='utf-8')
        w.require(pinned == [w.reference(p) for p in sorted((runtime / 'datasets/manga-collection').glob('accepted-*/acceptance.json'))],
                  'Receipt set advanced; choose and validate the new candidate again')
        w.require(w.gate.file_hash(args.public_backup.resolve()) == backup_sha, 'Public observation changed during freeze')
        for source, sha in unique.values(): w.require(w.gate.file_hash(source) == sha, 'Frozen input changed')
        staging.rename(output)
    return report


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--runtime', type=Path, required=True)
    cli.add_argument('--release', required=True)
    cli.add_argument('--register', type=Path, required=True)
    cli.add_argument('--register-sha', required=True)
    cli.add_argument('--public-backup', type=Path, required=True)
    cli.add_argument('--output', type=Path, required=True)
    args = cli.parse_args()
    print(json.dumps(prepare(args), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
