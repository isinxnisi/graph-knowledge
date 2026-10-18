#!/usr/bin/env python3
"""Narrow, cache-only recovery of blocked UTC-offset fixture timestamps. No apply."""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value


issues = module('recovery_issues', ROOT / 'scripts/collection-issues.py')
gate = issues.gate
read, save, digest, require = gate.read, gate.save, gate.content_hash, gate.require
NO_APPLY = {'local': False, 'beta': False, 'vps': False}


def safe_id(value):
    require(isinstance(value, str) and re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value) and len(value) <= 65, 'Invalid recovery ID')
    return value


def target(root, g, value):
    recipe = read(root / value['execution']['inputs'][0]['file'])
    approval = g.approval(root / 'datasets/collection-themes', value)
    return {'themeId': value['id'], 'revision': value['revision'], 'definitionSha256': digest(value), 'execution': value['execution'],
            'targets': {'people': [{'name': p['name'], 'qid': p['wikidata']} for p in recipe['people']],
                        'works': [{'name': p['name'], 'qid': p['wikidata'], 'isbn13': p['isbn13']} for p in recipe['works']]},
            'existingApprovalSha256': digest(approval)}


def job_directory(root, g, value):
    packet = g.packet(root / 'datasets/collection-themes', value)
    key = digest({'order': packet, 'runnerSha256': g.file_hash(root / 'scripts/collection-themes.py')})
    return root / '.local/collection-jobs' / (value['id'] + '-r' + str(value['revision']).zfill(4) + '-' + key[:16])


def transformed_recipe(old, revision):
    new = copy.deepcopy(old); prefix = 'datasets/manga-collection/r' + str(revision).zfill(4) + '/'
    new.update(id='manga-r' + str(revision).zfill(4), stamp=issues.fixture_stamp(old['stamp']),
               reviewArtifacts=[prefix + 'anchor-review.json', prefix + 'publication-review.json'])
    require(new['stamp'] != old['stamp'], 'This recovery only repairs noncanonical UTC offset timestamps')
    return new


def transformed_theme(old, ident, revision, recipe_path, g):
    new = copy.deepcopy(old)
    new.update(id=ident, revision=revision, title=old['title'] + '（日時形式復旧）',
               coverageReferences=[recipe_path.removesuffix('recipe.json') + name for name in ['anchor-review.json', 'publication-review.json']],
               execution=g.plan('manga-discovery-v2', recipe_path))
    return new


def approval_note(proof, previous):
    return '既存Issue承認範囲内の日時形式不具合復旧。新たな人間判断・正式受入ではない。\n' + gate.dump({'recovery': proof, 'humanDecision': previous['humanDecision'], 'issueOrigin': previous['issueOrigin']})


def original(root, g, record):
    require(record['kind'] == 'collect-review' and record['phase'] == 'blocked' and
            'Invalid ISO datetime' in record.get('message', ''), 'Recovery requires the specific blocked fixture timestamp failure')
    previous = record['request']
    require(record['requestId'] == previous['id'] and previous['kind'] == 'collect-review' and previous['status'] == 'approved', 'Invalid predecessor')
    require(not previous.get('recovery'), 'Nested recovery is not supported')
    require(previous['applyAuthorized'] == NO_APPLY and previous['approvalScope'] == 'collection-candidates-and-review-only' and previous.get('issueOrigin'), 'No collection-only Issue permission')
    t = previous['target']; registry = root / 'datasets/collection-themes'
    value = g.definition(registry, t['themeId'], t['revision'])
    require(target(root, g, value) == t, 'Frozen predecessor target/approval changed')
    g.verify_execution(value['execution'])
    path = root / value['execution']['inputs'][0]['file']; recipe = read(path)
    cache = job_directory(root, g, value) / 'request-cache'
    require(cache.exists() and cache.resolve().is_relative_to(root / '.local/collection-issues'), 'Shared Issue cache required')
    state = read(cache / 'requests.json')
    require(state['policy'] == recipe['requestPolicy'] and len(state['attempts']) <= state['policy']['maxAttempts'], 'Original shared budget changed')
    # Fail before dispatch if any acquisition would require another provider request.
    required = [('wikidata', p['wikidata']) for p in recipe['people'] + recipe['works']] + [('ndl', w['isbn13']) for w in recipe['works']]
    for kind, ident in required:
        key = kind + '-' + ident; receipt = state['responses'].get(key)
        require(receipt and receipt['url'] == issues.legacy.request_url(kind, ident) and
                g.file_hash(cache / (key + '.body')) == receipt['sha256'], 'Required cache response missing or modified: ' + key)
    return previous, value, recipe, cache


def validate(root, request, predecessor, g):
    r = request['recovery']
    require(set(r) == {'schemaVersion', 'kind', 'predecessorRequestId', 'predecessorRequestSha256', 'predecessorTargetSha256',
                      'predecessorRecipe', 'originalApprovalSha256', 'originalStamp', 'normalizedStamp'}, 'Unexpected recovery fields')
    require(r['schemaVersion'] == 1 and r['kind'] == 'fixture-utc-z-only' and request['parentRequestId'] == r['predecessorRequestId'], 'Unsupported recovery')
    previous, old_theme, old_recipe, cache = original(root, g, predecessor)
    require(previous['id'] == r['predecessorRequestId'] and predecessor['requestSha256'] == r['predecessorRequestSha256'], 'Predecessor request hash changed')
    require(digest(previous['target']) == r['predecessorTargetSha256'] and previous['target']['existingApprovalSha256'] == r['originalApprovalSha256'], 'Predecessor target hash changed')
    require(r['predecessorRecipe'] == {'file': old_theme['execution']['inputs'][0]['file'], 'sha256': g.file_hash(root / old_theme['execution']['inputs'][0]['file'])}, 'Original recipe reference differs')
    for field in ['humanDecision', 'issueOrigin', 'approvalScope', 'applyAuthorized', 'status', 'kind']:
        require(request[field] == previous[field], 'Recovery cannot change approval scope: ' + field)
    require(r['originalStamp'] == old_recipe['stamp'] and r['normalizedStamp'] == issues.fixture_stamp(old_recipe['stamp']), 'Recovery timestamp meaning differs')
    t = request['target']; value = g.definition(root / 'datasets/collection-themes', t['themeId'], t['revision'])
    require(value['id'] != old_theme['id'], 'Recovery requires a new immutable theme identity')
    recipe_path = value['execution']['inputs'][0]['file']; new_recipe = read(root / recipe_path)
    new_revision = int(Path(recipe_path).parent.name[1:])
    require(new_recipe == transformed_recipe(old_recipe, new_revision), 'Recovery changed more than timestamp representation and artifact paths')
    require(value == transformed_theme(old_theme, value['id'], value['revision'], recipe_path, g), 'Recovery theme changed meaning or execution scope')
    for old_path, new_path in zip(old_recipe['reviewArtifacts'], new_recipe['reviewArtifacts']):
        require((root / old_path).read_bytes() == (root / new_path).read_bytes(), 'Recovery changed evidence')
    require(target(root, g, value) == t and (job_directory(root, g, value) / 'request-cache').resolve() == cache.resolve(), 'Recovery target/cache changed')
    require(g.approval(root / 'datasets/collection-themes', value)['note'] == approval_note(r, previous), 'Recovery approval provenance changed')
    return True


def create(root, record, ident, theme_id, revision, recipe_revision, source_commit):
    safe_id(ident); safe_id(theme_id)
    require(re.fullmatch(r'[0-9a-f]{40}', source_commit) and type(recipe_revision) is int and 4 <= recipe_revision <= 9999, 'Invalid recovery version')
    g = module('recovery_runtime_gate', root / 'scripts/collection-themes.py')
    previous, old_theme, old_recipe, cache = original(root, g, record)
    require(ident != previous['id'], 'Recovery must use a new request ID')
    new_recipe = transformed_recipe(old_recipe, recipe_revision)
    path = 'datasets/manga-collection/r' + str(recipe_revision).zfill(4) + '/recipe.json'
    issues.frozen(root / path, new_recipe)
    for old_path, new_path in zip(old_recipe['reviewArtifacts'], new_recipe['reviewArtifacts']):
        data = (root / old_path).read_bytes(); dest = root / new_path
        if dest.exists(): require(dest.read_bytes() == data, 'Frozen recovery evidence differs')
        else: dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(data)
    value = transformed_theme(old_theme, theme_id, revision, path, g)
    registry = root / 'datasets/collection-themes'
    definition_path = g.revision_path(registry, 'themes', theme_id, revision)
    if definition_path.exists(): require(read(definition_path) == value, 'Frozen recovery definition changed')
    else:
        source = (root / path).with_name('theme.json'); issues.frozen(source, value)
        g.execute(argparse.Namespace(command='register', registry=registry, jobs=g.JOBS, file=source))
    proof = {'schemaVersion': 1, 'kind': 'fixture-utc-z-only', 'predecessorRequestId': previous['id'],
             'predecessorRequestSha256': record['requestSha256'], 'predecessorTargetSha256': digest(previous['target']),
             'predecessorRecipe': {'file': old_theme['execution']['inputs'][0]['file'], 'sha256': g.file_hash(root / old_theme['execution']['inputs'][0]['file'])},
             'originalApprovalSha256': previous['target']['existingApprovalSha256'], 'originalStamp': old_recipe['stamp'], 'normalizedStamp': new_recipe['stamp']}
    note = approval_note(proof, previous)
    approval_path = g.revision_path(registry, 'approvals', theme_id, revision)
    if approval_path.exists(): require(g.approval(registry, value)['note'] == note, 'Recovery approval differs')
    else: g.execute(argparse.Namespace(command='approve', registry=registry, jobs=g.JOBS, theme_id=theme_id, revision=revision,
                    reviewer=previous['humanDecision']['reviewer'], note=note, sha256=digest(value), confirm_review=True))
    job = job_directory(root, g, value); job.mkdir(parents=True, exist_ok=True); link = job / 'request-cache'
    if link.is_symlink(): require(link.resolve() == cache.resolve(), 'Recovery cache differs')
    else: require(not link.exists(), 'Recovery cache cannot replace an existing budget'); link.symlink_to(cache.resolve(), target_is_directory=True)
    request = {k: copy.deepcopy(previous[k]) for k in ['schemaVersion', 'kind', 'status', 'humanDecision', 'issueOrigin', 'approvalScope', 'applyAuthorized']}
    request.update(id=ident, sourceCommit=source_commit, parentRequestId=previous['id'], target=target(root, g, value), recovery=proof)
    validate(root, request, record, g)
    return request


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record', type=Path, required=True); parser.add_argument('--id', required=True)
    parser.add_argument('--theme', required=True); parser.add_argument('--revision', type=int, required=True)
    parser.add_argument('--recipe-revision', type=int, required=True); parser.add_argument('--source-commit', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        request = create(ROOT, read(args.record), args.id, args.theme, args.revision, args.recipe_revision, args.source_commit)
        issues.frozen(args.output, request); print(gate.dump({'request': str(args.output), 'id': request['id'], 'networkAttemptsAdded': 0, 'publicApply': False}), end='')
    except (ValueError, OSError, KeyError) as error:
        print(gate.dump({'error': str(error)}), file=sys.stderr, end=''); sys.exit(1)
