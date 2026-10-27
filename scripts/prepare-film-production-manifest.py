#!/usr/bin/env python3
"""Bind a saved-film draft to a fresh export and receipts; never accept, install or apply."""
import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--recipe', type=Path, required=True)
    cli.add_argument('--prior-review', type=Path, required=True)
    cli.add_argument('--backup', type=Path, required=True)
    cli.add_argument('--backup-sha', required=True)
    cli.add_argument('--worker-home', type=Path, required=True)
    cli.add_argument('--manual-lock-token', required=True)
    cli.add_argument('--output', type=Path, required=True)
    args = cli.parse_args()
    output = args.output.resolve()
    assert output.is_relative_to(ROOT / '.local') and not output.exists(), 'New private output required'
    w = load('production_manifest_workflow', ROOT / 'scripts/collection-workflow.py')
    a = load('production_manifest_adapter', ROOT / 'scripts/collect-film-manifest.py')
    freezer = load('production_manifest_freezer', ROOT / 'scripts/freeze-film-comparison.py')
    evidence = load('production_manifest_evidence', ROOT / 'scripts/collection-evidence.py')
    runtime = args.worker_home.resolve() / 'runtime'
    pending = runtime / 'datasets/film-collection/ab-manifest-20261028'
    assert a.sha(args.backup) == args.backup_sha, 'Backup hash differs'
    assert not pending.exists(), 'Refusing to replace an existing fixed review'
    ns = SimpleNamespace(**vars(w))
    ns.ROOT = runtime
    # This lock protects only creation of pending review data. No installed code,
    # config, jobs, decisions, receipts, services or Worker state are modified.
    with evidence.worker_guard(args, ns):
        snapshot = freezer.freeze(args.backup, runtime)
        snapshot['receiptDataRoot'] = str(runtime)
        output.mkdir(parents=True)
        comparison = output / 'comparison.json.gz'
        comparison.write_bytes(gzip.compress(a.dump(snapshot).encode(), mtime=0))
        manifest = a.load(args.recipe)
        manifest['inputs']['comparison'] = {'file': str(comparison.relative_to(ROOT)), 'sha256': a.sha(comparison)}
        recipe = output / 'manifest.json'
        recipe.write_text(a.dump(manifest))
        # Existing production review validates the backup and current public
        # metadata and archives the exact input bytes into the receipt data root.
        options = w.parser().parse_args([
            'film-production-review', '--data-root', str(runtime),
            '--production-backup', str(args.backup.resolve()), '--backup-sha', args.backup_sha,
            '--public-origin', 'https://plunode.net', '--recipe', str(recipe),
            '--trial', str(pending / 'trial'), '--output', str(pending / 'review'),
            '--decision-output', str(pending / 'decision-draft.json'),
            '--decision-id', 'film-saved-ab-20261028', '--release', 'film-saved-ab-20261028'])
        result = w.execute(options)
        prior = w.read(args.prior_review / 'proposed-records.json')
        assert w.read(pending / 'review/proposed-records.json') == prior, 'Fresh comparison changed selected records'
        decision = w.read(pending / 'decision-draft.json')
        assert decision['status'] == 'draft-not-approved'
        result.update(authority='fixed-pending-human-decision-not-acceptance',
                      productionBackupSha256=args.backup_sha,
                      productionRevision=snapshot['public']['revision'],
                      manifest={'file': str(recipe.relative_to(ROOT)), 'sha256': a.sha(recipe)},
                      newFormalReceipts=0, installedWorkerCodeChanged=False,
                      sameProposedRecordsAsOfflineReview=True)
        (output / 'result.json').write_text(w.dump(result))
        print(w.dump(result))


if __name__ == '__main__':
    main()
