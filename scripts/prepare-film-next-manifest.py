#!/usr/bin/env python3
"""Prepare only the unaccepted saved A/B inventory. Never accepts or republishes."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('next_saved_film', ROOT / 'scripts/collect-film-manifest.py')
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--comparison', type=Path, required=True)
    ap.add_argument('--coverage', type=Path, required=True)
    ap.add_argument('--evidence', type=Path, default=ROOT / 'docs/research/film-worker-pilot-20261028/minimal-credit-notes.json')
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--recorded-at', required=True, help='UTC Z timestamp for this new draft, not a human approval time')
    args = ap.parse_args(); output = args.output.resolve()
    a.need(output.is_relative_to(ROOT / '.local') and not output.exists(), 'A new private output directory is required')
    coverage = a.load(args.coverage); saved = a.load(ROOT / 'docs/research/film-discovery-pilot-20261026/CANDIDATES.json')
    published = {row['researchCandidateId'] for row in coverage['records'] if row['formalClaimId']}
    selected = [row['id'] for row in saved['candidates'] if row['id'] not in published and row['state'] == 'checked-source-candidate'
                and row['relation'] == 'CREDIT' and row['research_role'] in a.ROLE_MAP]
    deferred = [row['id'] for row in saved['candidates'] if row['id'] not in published and row['id'] not in selected]
    inputs = {'comparison': args.comparison, 'coverage': args.coverage, 'evidence': args.evidence,
              'candidates': ROOT / 'docs/research/film-discovery-pilot-20261026/CANDIDATES.json',
              'sourceReviews': ROOT / 'docs/research/film-discovery-pilot-20261026/source_reviews.json'}
    refs = {key: {'file': str(path.resolve().relative_to(ROOT)), 'sha256': a.sha(path)} for key, path in inputs.items()}
    manifest = {'schemaVersion': 1, 'adapter': a.ADAPTER, 'recordedAt': args.recorded_at, 'candidateIds': selected,
                'heldCandidateIds': [], 'deferredCandidateIds': deferred, 'publishedCandidateIds': sorted(published),
                'maxClaims': len(selected), 'inputs': refs}
    output.mkdir(parents=True); recipe = output / 'candidate-manifest.json'; recipe.write_text(a.dump(manifest))
    rows = a.inspect(ROOT, recipe, check_selection=False, require_ready=False)[3]
    manifest['heldCandidateIds'] = [row['candidateId'] for row in rows if row['status'] != 'ready-for-human-review']
    recipe.write_text(a.dump(manifest)); result = a.inspect(ROOT, recipe, require_ready=False)
    summary = {'authority': 'unaccepted-draft-only', 'trackedCandidates': len(saved['candidates']), 'trackedEntities': len(result[-1]),
               'alreadyPublishedExcluded': len(published), 'abReviewed': len(rows), 'abReady': sum(row['status'] == 'ready-for-human-review' for row in rows),
               'abHeld': len(manifest['heldCandidateIds']), 'deferredPreserved': len(deferred),
               'unacceptedCheckedRecords': coverage['counts']['unacceptedCheckedRecords'],
               'remainingEntityCandidates': coverage['counts']['remainingEntityCandidates'],
               'recipeSha256': a.sha(recipe), 'formalAcceptance': False, 'publicApply': False}
    (output / 'audit.json').write_text(a.dump({'summary': summary, 'rows': rows, 'entityMappings': list(result[-1].values())}))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__': main()
