#!/usr/bin/env python3
"""Human-reviewed collection definitions -> isolated candidates. No DB writes."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'datasets/collection-themes'
JOBS = ROOT / '.local/collection-jobs'
ADAPTER = 'nobel-affiliations-replay-v1'
GENERATOR = 'scripts/prepare-nobel-affiliations.py'
INPUTS = [
    'datasets/nobel-affiliations/v1/raw/laureates-0000.json',
    'datasets/nobel-affiliations/v1/raw/laureates-1000.json',
    'datasets/nobel-affiliations/v1/source.json',
    'datasets/public-kg/releases/20261011-001/data.json',
    'datasets/public-kg/releases/20261011-001/manifest.json',
]
CHECKS = ['purpose', 'scope', 'data-granularity', 'sources-and-terms', 'exploration', 'execution-boundary']
ID = re.compile(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z')
SHA = re.compile(r'[0-9a-f]{64}\Z')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def content_hash(value):
    # Whitespace is not scope; changes to any definition value are.
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode())


def file_hash(path):
    return digest(path.read_bytes())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def read(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_keys)


def save(path, value):
    """Replace a single receipt atomically; never used for frozen definitions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.write-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(dump(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def create(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.create-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(dump(value))
            stream.flush()
            os.fsync(stream.fileno())
        # Atomic, exclusive publication: a concurrent export cannot overwrite a definition.
        os.link(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


@contextmanager
def locked(directory):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / '.lock').open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        yield


def text(value):
    return isinstance(value, str) and bool(value.strip())


def strings(value, label, empty=False):
    require(isinstance(value, list) and (empty or len(value) > 0) and all(text(v) for v in value), f'Invalid {label}')
    require(len(set(value)) == len(value), f'Duplicate {label}')


def keys(value, expected, label):
    require(isinstance(value, dict) and set(value) == set(expected), f'Invalid fields in {label}: expected {expected}')


def validate(value):
    keys(value, ['schemaVersion', 'id', 'revision', 'title', 'purpose', 'worlds', 'relatedThemes', 'scope',
                 'dataRequirements', 'sources', 'exploration', 'coverageReferences', 'execution'], 'theme')
    require(type(value['schemaVersion']) is int and value['schemaVersion'] == 1, 'Unsupported schemaVersion')
    require(text(value['id']) and ID.fullmatch(value['id']) and len(value['id']) <= 80, 'Invalid theme ID')
    require(type(value['revision']) is int and 1 <= value['revision'] <= 9999, 'Invalid revision')
    for field in ['title', 'purpose']:
        require(text(value[field]), f'Missing {field}')
    strings(value['worlds'], 'worlds')
    strings(value['relatedThemes'], 'relatedThemes', empty=True)
    strings(value['coverageReferences'], 'coverageReferences', empty=True)
    keys(value['scope'], ['include', 'exclude'], 'scope')
    for field in ['include', 'exclude']:
        strings(value['scope'][field], f'scope.{field}')
    require(isinstance(value['dataRequirements'], list) and value['dataRequirements'], 'Missing dataRequirements')
    for item in value['dataRequirements']:
        keys(item, ['kind', 'description', 'granularity'], 'dataRequirement')
        require(item['kind'] in ['entity', 'claim', 'source', 'citation', 'identity', 'model-gap'], 'Invalid data kind')
        require(text(item['description']) and text(item['granularity']), 'Missing data description/granularity')
    require(isinstance(value['sources'], list) and value['sources'], 'Missing sources')
    for source in value['sources']:
        keys(source, ['name', 'url', 'usage', 'termsNote'], 'source')
        require(all(text(v) for v in source.values()), 'Missing source review information')
        require(source['url'].startswith('https://'), 'Source URL must use HTTPS')
    keys(value['exploration'], ['questions', 'existingPredicates', 'modelGaps'], 'exploration')
    for field in ['questions', 'existingPredicates', 'modelGaps']:
        strings(value['exploration'][field], f'exploration.{field}', empty=field != 'questions')
    execution = value['execution']
    if execution is not None:
        keys(execution, ['adapter', 'codeSha256', 'inputs', 'maxEntities', 'maxClaims'], 'execution')
        require(execution['adapter'] == ADAPTER, 'Adapter is not allowlisted')
        require(isinstance(execution['codeSha256'], str) and SHA.fullmatch(execution['codeSha256']), 'Invalid code hash')
        require(isinstance(execution['inputs'], list), 'Invalid input inventory')
        for item in execution['inputs']:
            keys(item, ['file', 'sha256'], 'input')
            require(isinstance(item['sha256'], str) and SHA.fullmatch(item['sha256']), 'Invalid input hash')
        require([i['file'] for i in execution['inputs']] == INPUTS, 'Adapter input inventory must match the fixed recipe')
        for field in ['maxEntities', 'maxClaims']:
            require(type(execution[field]) is int and 1 <= execution[field] <= 10000, f'Invalid {field}')
    return value


def revision_path(registry, area, theme_id, revision):
    require(ID.fullmatch(theme_id) and len(theme_id) <= 80, 'Invalid theme ID')
    require(1 <= revision <= 9999, 'Invalid revision')
    return registry / area / theme_id / f'r{revision:04}.json'


def definition(registry, theme_id, revision):
    value = validate(read(revision_path(registry, 'themes', theme_id, revision)))
    require((value['id'], value['revision']) == (theme_id, revision), 'Definition ID/revision mismatch')
    return value


def approval(registry, value):
    theme_id, revision = value['id'], value['revision']
    require(not revision_path(registry, 'revocations', theme_id, revision).exists(), 'Theme revision approval was revoked')
    path = revision_path(registry, 'approvals', theme_id, revision)
    require(path.exists(), 'Unapproved theme revision: collection/export is prohibited')
    record = read(path)
    keys(record, ['schemaVersion', 'themeId', 'revision', 'definitionSha256', 'reviewer', 'reviewedAt', 'note', 'checks'], 'approval')
    require(record['schemaVersion'] == 1 and (record['themeId'], record['revision']) == (theme_id, revision), 'Approval ID mismatch')
    require(record['definitionSha256'] == content_hash(value), 'Approved definition changed; register/review a new revision')
    require(all(text(record[k]) for k in ['reviewer', 'reviewedAt', 'note']) and record['checks'] == CHECKS, 'Incomplete review record')
    return record


def status(registry, value):
    if revision_path(registry, 'revocations', value['id'], value['revision']).exists():
        return 'revoked'
    if not revision_path(registry, 'approvals', value['id'], value['revision']).exists():
        return 'candidate'
    try:
        approval(registry, value)
        return 'approved'
    except ValueError:
        return 'approval-invalid'


def plan():
    return {'adapter': ADAPTER, 'codeSha256': file_hash(ROOT / GENERATOR),
            'inputs': [{'file': p, 'sha256': file_hash(ROOT / p)} for p in INPUTS],
            'maxEntities': 1200, 'maxClaims': 1000}


def verify_execution(execution):
    require(execution is not None, 'No executable adapter: export the approved definition or review a revision with execution conditions')
    current = plan()
    for field in ['adapter', 'codeSha256', 'inputs']:
        require(execution[field] == current[field], f'Execution {field} changed; a new revision and review are required')


def packet(registry, value):
    record = approval(registry, value)
    if value['execution'] is not None:
        verify_execution(value['execution'])
    return {'schemaVersion': 1, 'theme': value, 'definitionSha256': content_hash(value),
            'approval': record, 'approvalSha256': content_hash(record),
            'executionStatus': 'frozen-adapter' if value['execution'] is not None else 'not-configured',
            'authority': ('candidate-collection-only; not knowledge acceptance or public release approval'
                          if value['execution'] is not None else
                          'approved-planning-only; collection requires a reviewed execution revision; not knowledge acceptance or public release approval')}


def technical_validation(directory):
    # Use the existing validator. The validate branch never loads an env file or opens a DB.
    result = subprocess.run(['node', '--import', 'tsx', 'scripts/public-kg.ts', 'validate', str(directory)],
                            cwd=ROOT, capture_output=True, text=True, timeout=120, check=False)
    require(result.returncode == 0, f'Existing public:validate failed (Node 24 + dependencies required): {(result.stderr or result.stdout)[-2500:]}')
    report = json.loads(result.stdout)
    require(report.get('valid') is True, 'Existing validator did not report valid=true')
    return report


def generate(execution, staging):
    # Only the allowlisted, hash-checked generator is loaded. Its __main__ writer never runs.
    module = runpy.run_path(str(ROOT / GENERATOR))
    generated = module['build']()
    expected = {
        ROOT / 'datasets/nobel-affiliations/v1/ledger.json': 'ledger.json',
        ROOT / 'datasets/public-kg/releases/20261014-nobel-001/data.json': 'release/data.json',
        ROOT / 'datasets/public-kg/releases/20261014-nobel-001/manifest.json': 'release/manifest.json',
    }
    require(set(generated) == set(expected), 'Unexpected generator outputs')
    for original, relative in expected.items():
        path = staging / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(generated[original], encoding='utf-8')
    fixture = read(staging / 'release/data.json')
    base = read(ROOT / 'datasets/public-kg/releases/20261011-001/data.json')
    counts = {field: len(fixture[field]) for field in ['entities', 'claims', 'sources', 'citations']}
    require(counts['entities'] <= execution['maxEntities'] and counts['claims'] <= execution['maxClaims'], 'Candidate exceeds approved output limits')
    summary = {'kind': 'historical-frozen-candidate-replay', 'notForCurrentPublicApply': True,
               'counts': counts, 'addedVsFrozenBase': {f: counts[f] - len(base[f]) for f in counts},
               'ledgerRows': len(read(staging / 'ledger.json')['rows']),
               'validation': technical_validation(staging / 'release')}
    save(staging / 'summary.json', summary)
    return summary


def inventory(directory):
    return {p.relative_to(directory).as_posix(): file_hash(p) for p in sorted(directory.rglob('*')) if p.is_file()}


def verify_result(directory, state):
    require(state.get('artifacts') and inventory(directory / 'artifacts') == state['artifacts'], 'Job result is missing or modified; inspect before retrying')
    require(read(directory / 'work-order.json') == state['workOrder'], 'Job work order was modified')


def run(registry, jobs, value):
    order = packet(registry, value)
    execution = value['execution']
    verify_execution(execution)
    runner_hash = file_hash(Path(__file__))
    job_key = content_hash({'order': order, 'runnerSha256': runner_hash})
    job_id = f"{value['id']}-r{value['revision']:04}-{job_key[:16]}"
    directory = jobs / job_id
    with locked(jobs):
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / 'job.json'
        if path.exists():
            state = read(path)
            require(state['jobKey'] == job_key and state['workOrder'] == order, 'Job identity mismatch')
            if state['status'] == 'candidate-ready':
                verify_result(directory, state)
                return {'jobId': job_id, 'status': state['status'], 'unchanged': True, 'directory': str(directory), 'summary': read(directory / 'artifacts/summary.json')}
            require(state['status'] in ['running', 'failed'], 'Unknown job state')
            if state['attempts'] and state['attempts'][-1]['status'] == 'running':
                state['attempts'][-1].update(status='interrupted', finishedAt=now())
        else:
            state = {'schemaVersion': 1, 'jobId': job_id, 'jobKey': job_key, 'runnerSha256': runner_hash,
                     'workOrder': order, 'status': 'running', 'attempts': [], 'artifacts': {}}
            # A crash between writing the order and the first job receipt is resumable.
            if not (directory / 'work-order.json').exists():
                create(directory / 'work-order.json', order)
        require(read(directory / 'work-order.json') == order, 'Job work order was modified')
        attempt = {'number': len(state['attempts']) + 1, 'startedAt': now(), 'status': 'running', 'stage': 'generate'}
        state['attempts'].append(attempt)
        state['status'] = 'running'
        save(path, state)
        staging = directory / '.staging'
        try:
            if staging.exists():
                shutil.rmtree(staging)
            staging.mkdir()
            summary = generate(execution, staging)
            attempt['stage'] = 'verify-inputs-and-approval'
            save(path, state)
            verify_execution(execution)
            require(packet(registry, definition(registry, value['id'], value['revision'])) == order, 'Approval changed during execution')
            artifacts = inventory(staging)
            target = directory / 'artifacts'
            if target.exists():
                require(inventory(target) == artifacts, 'Unfinished job artifacts differ; inspect before retrying')
                shutil.rmtree(staging)
            else:
                staging.rename(target)
            state.update(status='candidate-ready', artifacts=artifacts)
            attempt.update(status='succeeded', stage='candidate-ready', finishedAt=now())
            save(path, state)
            return {'jobId': job_id, 'status': state['status'], 'unchanged': False, 'directory': str(directory), 'summary': summary}
        except BaseException as error:
            state['status'] = 'failed'
            attempt.update(status='failed', finishedAt=now(), error=f'{type(error).__name__}: {error}')
            save(path, state)
            raise


def parser():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--registry', type=Path, default=REGISTRY)
    cli.add_argument('--jobs', type=Path, default=JOBS)
    commands = cli.add_subparsers(dest='command', required=True)
    commands.add_parser('list')
    commands.add_parser('jobs')
    item = commands.add_parser('inspect')
    item.add_argument('job_id')
    item = commands.add_parser('register')
    item.add_argument('--file', type=Path, required=True)
    item = commands.add_parser('plan')
    item.add_argument('adapter', choices=[ADAPTER])
    for command in ['review', 'approve', 'revoke', 'export', 'run']:
        item = commands.add_parser(command)
        item.add_argument('theme_id')
        item.add_argument('--revision', type=int, required=True)
        if command in ['approve', 'revoke']:
            item.add_argument('--reviewer', required=True)
            item.add_argument('--note', required=True)
        if command == 'approve':
            item.add_argument('--sha256', required=True)
            item.add_argument('--confirm-review', action='store_true', required=True)
        if command == 'export':
            item.add_argument('--out', type=Path, required=True)
    return cli


def execute(args):
    registry, jobs = args.registry.resolve(), args.jobs.resolve()
    require(registry != jobs, 'Registry and jobs must use different directories')
    if args.command == 'plan':
        return plan()
    with locked(registry):
        if args.command == 'register':
            value = validate(read(args.file))
            directory = registry / 'themes' / value['id']
            revisions = [int(p.stem[1:]) for p in directory.glob('r*.json')] if directory.exists() else []
            require(value['revision'] == max(revisions, default=0) + 1, 'Register the next consecutive revision')
            create(revision_path(registry, 'themes', value['id'], value['revision']), value)
            return {'registered': value['id'], 'revision': value['revision'], 'status': 'candidate', 'definitionSha256': content_hash(value)}
        if args.command == 'list':
            result = []
            for path in sorted((registry / 'themes').glob('*/r*.json')):
                value = definition(registry, path.parent.name, int(path.stem[1:]))
                result.append({'id': value['id'], 'revision': value['revision'], 'title': value['title'],
                               'status': status(registry, value), 'executableAdapter': (value['execution'] or {}).get('adapter')})
            return result
        if args.command in ['jobs', 'inspect']:
            with locked(jobs):
                if args.command == 'jobs':
                    return [{'jobId': v['jobId'], 'themeId': v['workOrder']['theme']['id'],
                             'revision': v['workOrder']['theme']['revision'], 'status': v['status'], 'attempts': len(v['attempts'])}
                            for v in (read(p) for p in sorted(jobs.glob('*/job.json')))]
                require(re.fullmatch(r'[a-z0-9-]+-r[0-9]{4}-[0-9a-f]{16}', args.job_id), 'Invalid job ID')
                directory = jobs / args.job_id
                state = read(directory / 'job.json')
                if state['status'] == 'candidate-ready':
                    verify_result(directory, state)
                return dict(state, directory=str(directory), summary=read(directory / 'artifacts/summary.json') if state['status'] == 'candidate-ready' else None)
        value = definition(registry, args.theme_id, args.revision)
        if args.command == 'review':
            execution_status = 'not-configured'
            if value['execution'] is not None:
                try:
                    verify_execution(value['execution'])
                    execution_status = 'frozen-inputs-match'
                except ValueError as error:
                    execution_status = str(error)
            return {'theme': value, 'definitionSha256': content_hash(value), 'status': status(registry, value),
                    'reviewChecks': CHECKS, 'executionStatus': execution_status,
                    'notice': 'Candidate approval does not accept any Entity/Claim or authorize publication. Human review required.'}
        if args.command in ['approve', 'revoke']:
            require(text(args.reviewer) and text(args.note), 'Review identity and note must not be blank')
        if args.command == 'approve':
            require(args.confirm_review is True, 'Explicit review confirmation required')
            require(args.sha256 == content_hash(value), 'Review digest differs from this definition')
            require(not revision_path(registry, 'revocations', value['id'], value['revision']).exists(), 'Revoked revisions cannot be reapproved; create a new revision')
            if value['execution'] is not None:
                verify_execution(value['execution'])
            record = {'schemaVersion': 1, 'themeId': value['id'], 'revision': value['revision'],
                      'definitionSha256': content_hash(value), 'reviewer': args.reviewer, 'reviewedAt': now(), 'note': args.note, 'checks': CHECKS}
            create(revision_path(registry, 'approvals', value['id'], value['revision']), record)
            return {'status': 'approved', 'approval': record}
        if args.command == 'revoke':
            approval(registry, value)
            record = {'themeId': value['id'], 'revision': value['revision'], 'reviewer': args.reviewer, 'revokedAt': now(), 'note': args.note}
            create(revision_path(registry, 'revocations', value['id'], value['revision']), record)
            return {'status': 'revoked', 'revocation': record}
        if args.command == 'export':
            order = packet(registry, value)
            create(args.out, order)
            return {'exported': str(args.out), 'definitionSha256': order['definitionSha256']}
        if args.command == 'run':
            return run(registry, jobs, value)
        raise ValueError('Unknown command')


def main():
    args = parser().parse_args()
    try:
        print(dump(execute(args)), end='')
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(dump({'error': str(error)}), file=sys.stderr, end='')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
