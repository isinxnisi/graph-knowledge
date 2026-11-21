#!/usr/bin/env python3
"""Restore the preview Worker’s inheritance of the active Web operator policy."""
import argparse
import copy
import fcntl
import importlib
import json
import os
from pathlib import Path
import re
import stat

from production_release import ROOT, Production, atomic, digest, emit, load_json, require, write_json

preview = importlib.import_module('activate-theme-preview-production')

CASE = '4c649f02-a749-4ccd-822b-ddba9757d8fc'
FAILED_RECEIPT = '6c6b2ee2-88b6-4a1e-b6bb-364baf7d9a8c'
SERVICE = preview.SERVICE
POLICY = preview.OPERATOR_ENV
PREVIEW_BACKUP = 'theme-preview-' + preview.SOURCE[:12] + '-' + preview.SEAL[:16]

CASE_SQL = f"""SELECT json_build_object(
 'owner', p.owner_id, 'active', u.active, 'state', a.state, 'reason', a.reason,
 'review', p.phase='review',
 'leaseFree', p.lease_until IS NULL OR p.lease_until<=clock_timestamp(),
 'ownerMatchesClaim', EXISTS (
  SELECT 1 FROM theme_production.operations o WHERE o.case_id=p.id AND o.owner_id=p.owner_id
  AND o.result->>'outcome'='claimed' AND o.result->>'executionId'=a.execution_id::text
 ),
 'mcpObserved', EXISTS (
  SELECT 1 FROM theme_production.diagnostics d WHERE d.case_id=p.id AND d.request_id=a.id
  AND d.execution_id=a.execution_id AND d.stage='mcp-authenticated' AND d.code='capture_theme_review_preview'
 ),
 'workerRejected', EXISTS (
  SELECT 1 FROM theme_production.diagnostics d WHERE d.case_id=p.id AND d.request_id=a.id
  AND d.execution_id=a.execution_id AND d.stage='preview' AND d.code='OPERATOR_REQUIRED'
 ))
 FROM theme_production.automation_requests a
 JOIN theme_production.cases p ON p.id=a.case_id
 JOIN public."user" u ON u.id=p.owner_id
 WHERE p.id='{CASE}' AND a.id='{FAILED_RECEIPT}' AND p.origin='https://plunode.net'
 AND p.environment='production' AND a.kind='preview'"""

WORKER_PROBE = """
import {Pool} from 'pg';
import {authorizeProductOperator} from './lib/server/member/product-editorial.ts';
const pool = new Pool({connectionString:process.env.MEMBER_DATABASE_URL,max:1});
try {
 const {rows:[row]}=await pool.query(
  "SELECT owner_id FROM theme_production.cases WHERE id=$1 AND environment='production' AND origin='https://plunode.net'",
  [process.argv[1]]);
 if(!row)throw Error('Preview case unavailable');
 try{
  await authorizeProductOperator(pool,row.owner_id);
  console.log('AUTHORIZED');
 }catch(error){
  if(error.code!=='OPERATOR_REQUIRED')throw Error('Unable to run the operator check');
  console.log('OPERATOR_REQUIRED');
 }
}finally{await pool.end();}
"""


def env(container):
    return dict(item.split('=', 1) for item in container['Config']['Env'])


def inherited_policy(web, worker, row):
    expected = {key: web.get(key, '') for key in POLICY}
    allowlist = [item.strip() for item in expected['SITE_OPERATOR_USER_IDS'].split(',') if item.strip()]
    uuid4 = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', re.I)
    flags = ('COMMUNITY_ENABLED', 'SITE_OPERATIONS_ENABLED')
    require(all(expected[k] == '1' for k in flags)
            and allowlist and all(uuid4.fullmatch(item) for item in allowlist)
            and not any(c in expected['SITE_OPERATOR_USER_IDS'] for c in '\r\n\0'),
            'Web operator policy is missing or invalid')
    require(row['active'] is True and row['owner'] in allowlist and row['ownerMatchesClaim'] is True
            and row['mcpObserved'] is True and row['workerRejected'] is True and row['review'] is True
            and row['state'] == 'blocked' and row['reason'] == 'OPERATOR_REQUIRED',
            'The case owner, receipt or permission check no longer matches the reported incident')
    differing = [key for key in POLICY if worker.get(key) != expected[key]]
    # A preview Worker must never carry additional principals absent from the Web allowlist.
    worker_ids = {item.strip() for item in worker.get('SITE_OPERATOR_USER_IDS', '').split(',') if item.strip()}
    require(worker_ids.issubset(allowlist), 'The Worker has unrelated operator settings; inspect before repairing')
    return expected, differing


def probe(runtime):
    result = runtime.dc_run('exec', '-T', SERVICE, 'node', '--import', 'tsx', '--input-type=module',
                            '-e', WORKER_PROBE, CASE, label='Check the live Worker’s operator authorization')
    require(result in ('AUTHORIZED', 'OPERATOR_REQUIRED'), 'The Worker returned an unknown authorization result')
    return result


def repair(runtime, stage):
    runtime.dc.extend(['--profile', SERVICE])
    approved = load_json(stage / 'activation-plan.json')
    audit = preview.compatibility(runtime, stage)
    require(approved['sourceCommit'] == preview.SOURCE, 'Unexpected production plan')
    folder = runtime.root / 'backups' / PREVIEW_BACKUP
    require(folder.resolve() == folder and folder.stat().st_uid == 0 and not folder.stat().st_mode & 0o077,
            'Preview recovery folder is not private')
    journal = folder / 'state.json'
    state = load_json(journal)
    require(state['seal'] == preview.SEAL and digest(runtime.compose) == state['after'], 'Preview release differs')
    web = runtime.inspect('web')
    worker = runtime.inspect(SERVICE)
    require(web and worker and worker['State']['Running'] and
            worker['Config']['Labels']['org.opencontainers.image.revision'] == preview.SOURCE,
            'Expected Worker is unavailable')
    web_env, worker_env = env(web), env(worker)
    for key, value in preview.SAFE_IMAGE_ENV.items():
        require(worker_env.get(key) == value, 'The image API configuration differs')
    require(not worker_env.get('THEME_IMAGE_OPENAI_API_KEY')
            and web_env.get('MEMBER_DATABASE_URL') == worker_env.get('MEMBER_DATABASE_URL'),
            'The approved image API state or member database differs')
    require(web_env.get('THEME_AUTOMATION_ENABLED') == worker_env.get('THEME_AUTOMATION_ENABLED') == '1',
            'Theme preview is not active')
    row = json.loads(runtime.sql('member', CASE_SQL))
    expected, differing = inherited_policy(web_env, worker_env, row)
    auth_before = probe(runtime)
    emit('theme-preview-operator-audit', caseId=CASE, automationId=FAILED_RECEIPT,
         ownerMatchesClaim=True, ownerActive=True, webAllowsOwner=True, sameMemberDatabase=True,
         workerAuthorization=auth_before, workerPolicyDifferences=differing, caseLeaseFree=row['leaseFree'])
    if not differing:
        require(auth_before == 'AUTHORIZED', 'Worker policy matches Web, but authorization still fails')
        return
    require(auth_before == 'OPERATOR_REQUIRED', 'Current Worker authorization no longer matches this incident')
    envfile = runtime.root / 'theme-automation.env'
    info = envfile.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o600,
            'Preview environment is not administrator-private')
    current = envfile.read_text()
    retained = ''.join(line for line in current.splitlines(keepends=True) if line.split('=', 1)[0] not in POLICY)
    require(retained.endswith('\n'), 'Unexpected Worker env file format')
    added = ''.join(f'{key}={expected[key]}\n' for key in POLICY)
    intended = retained + added
    saved = folder / 'theme-automation.env.before-operator-inheritance'
    if not saved.exists():
        require(digest(envfile) == state['env'], 'Worker settings changed after activation')
        atomic(saved, current)
    else:
        require(saved.resolve() == saved and saved.stat().st_uid == 0
                and stat.S_IMODE(saved.stat().st_mode) == 0o600
                and current in (saved.read_text(), intended), 'Unexpected recovery input')
    before = preview.compose_config(runtime)
    try:
        atomic(envfile, intended)
        after = preview.compose_config(runtime)
        projected = copy.deepcopy(after)
        for key in POLICY:
            old = before['services'][SERVICE]['environment']
            if key in old:
                projected['services'][SERVICE]['environment'][key] = old[key]
            else:
                projected['services'][SERVICE]['environment'].pop(key, None)
        require(projected == before, 'Proposed repair changes more than the Worker operator policy')
        runtime.start((SERVICE,))
        actual = runtime.service_present(SERVICE, worker['Image'])
        require(actual['RestartCount'] == 0 and all(env(actual).get(k) == v for k, v in expected.items())
                and probe(runtime) == 'AUTHORIZED', 'The restarted Worker did not inherit the Web policy')
        final = preview.compatibility(runtime, stage)
        require(final == audit, 'An existing production service or ledger changed during Worker restart')
        state['env'] = digest(envfile)
        write_json(journal, state)
        emit('theme-preview-operator-repaired', caseId=CASE, build=preview.BUILD,
             workerAuthorization='AUTHORIZED', restarted=[SERVICE], imageApiEnabled=False)
    except BaseException:
        try:
            atomic(envfile, saved.read_text())
            runtime.start((SERVICE,))
            state['env'] = digest(envfile)
            write_json(journal, state)
            emit('theme-preview-operator-restored', service=SERVICE)
        except Exception:
            emit('theme-preview-operator-restore-needs-operator', backup=str(saved))
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage', required=True, type=Path)
    args = parser.parse_args()
    stage = args.stage.resolve(strict=True)
    require(os.geteuid() == 0 and stage.parent == Path('/root') and stage.stat().st_uid == 0
            and not stage.stat().st_mode & 0o077, 'A private administrator stage is required')
    os.umask(0o077)
    with (ROOT / '.member-activation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        repair(Production(ROOT, None), stage)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        raise SystemExit(str(error))
