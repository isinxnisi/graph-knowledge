#!/usr/bin/env python3
"""Restore the pre-U3 backup elsewhere and check that its original rows survive.

Only a newly allocated, explicitly prefixed test DB is restored/deleted. The live
DB is read-only; publication_control is expected to point to a newer generation.
Run under the normal Autopilot hold after finishing the U3 input checks.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = 'plunode-issue75-postgres'
LIVE = 'plunode_theme75'
PREFIX = 'plunode_knowledge75_test_u3restore_'

def command(args, data=None):
    return subprocess.check_output(args, input=data)

def sql(db, statement):
    assert db == LIVE or (db.startswith(PREFIX) and re.fullmatch(r'[a-z0-9_]+', db))
    return command(['docker','exec',CONTAINER,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','theme75','-d',db,'-c',statement]).decode().strip()

def table_rows(db, schema, table):
    assert re.fullmatch(r'[a-z0-9_]+',schema) and re.fullmatch(r'[a-z0-9_]+',table)
    value = sql(db, "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM " + schema + '.' + table + ' t')
    return json.loads(value)

def canon(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',',':'))

def main():
    backup = ROOT/'.local/issue75/u3-before.dump'
    observed = json.loads((ROOT/'.local/issue75/u3-preservation-before.json').read_text())
    assert backup.is_file() and hashlib.sha256(backup.read_bytes()).hexdigest() == observed['sha256']
    container = json.loads(command(['docker','inspect',CONTAINER]))[0]
    assert container['Config']['Labels'].get('plunode.scope') == 'issue75'
    assert any(x.get('Name') == 'plunode-issue75-data' for x in container['Mounts'])
    assert container['HostConfig']['PortBindings']['5432/tcp'] == [{'HostIp':'127.0.0.1','HostPort':'55475'}]
    db = PREFIX + str(time.time_ns())
    result = {'backup':observed,'sourceDatabaseRestoredOrReset':False,'testDatabase':db,'tables':{},'newMigrations':[]}
    command(['docker','exec',CONTAINER,'createdb','-U','theme75',db])
    try:
        command(['docker','exec','-i',CONTAINER,'pg_restore','--no-owner','--no-privileges','--exit-on-error','-U','theme75','-d',db],backup.read_bytes())
        tables = json.loads(sql(db,"SELECT json_agg(t) FROM (SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('knowledge75','theme75') ORDER BY schemaname,tablename) t"))
        for row in tables:
            schema,table = row['schemaname'],row['tablename']
            if schema == 'knowledge75' and table == 'publication_control': continue
            before,after = table_rows(db,schema,table),table_rows(LIVE,schema,table)
            old_set,new_set = {canon(r) for r in before},{canon(r) for r in after}
            assert old_set <= new_set, 'An original row changed or disappeared: '+schema+'.'+table
            result['tables'][schema+'.'+table] = {'beforeRows':len(before),'afterRows':len(after),'allOriginalRowsIdentical':True}
        before_ledger,after_ledger = table_rows(db,'knowledge75','migrations'),table_rows(LIVE,'knowledge75','migrations')
        assert before_ledger == after_ledger, 'U3 must not silently change the schema ledger'
        for row in after_ledger:
            assert hashlib.sha256((ROOT/'migrations/knowledge-foundation'/row['name']).read_bytes()).hexdigest() == row['checksum']
        state = table_rows(LIVE,'theme75','state')[0]['body']
        result['oldThemeState'] = {k:len(state.get(k,[])) for k in ['themes','capsules','shares','meanings']}
        result['oldThemeStateIdentical'] = table_rows(db,'theme75','state') == table_rows(LIVE,'theme75','state')
        assert result['oldThemeStateIdentical']
        result.update(completed=True,migrationLedgerIdentical=True)
    finally:
        assert db.startswith(PREFIX) and db != LIVE
        command(['docker','exec',CONTAINER,'dropdb','-U','theme75',db])
    result['testDatabaseRemoved'] = True
    output = ROOT/'docs/research/issue75-foundation/u3-preservation-results.json'
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['completed','oldThemeState','oldThemeStateIdentical','migrationLedgerIdentical','testDatabaseRemoved']}))

if __name__ == '__main__': main()
