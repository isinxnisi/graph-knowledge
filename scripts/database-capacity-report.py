#!/usr/bin/env python3
"""Read-only aggregate DB capacity audit; never dumps content or performs cleanup."""
import datetime,json

def report(sql):
 def read(query):
  value=sql("BEGIN READ ONLY; SET LOCAL statement_timeout='15000ms'; "+query+"; COMMIT")
  return json.loads(value)
 tables=read("""SELECT coalesce(json_agg(x ORDER BY total_bytes DESC),'[]') FROM (
 SELECT s.schemaname AS schema,s.relname AS table,pg_table_size(s.relid) AS data_bytes,
 pg_indexes_size(s.relid) AS index_bytes,pg_total_relation_size(s.relid) AS total_bytes,
 s.n_live_tup AS estimated_live_rows,s.n_dead_tup AS estimated_dead_rows,
 s.last_autovacuum,s.last_autoanalyze
 FROM pg_stat_user_tables s) x""")
 result={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'database':read("SELECT json_build_object('name',current_database(),'bytes',pg_database_size(current_database()))"),'tables':tables}
 names={t['schema']+'.'+t['table'] for t in tables}
 if 'knowledge75.revisions' in names:
  result['knowledgeRevisions']=read("""SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT kind,count(*) AS versions,count(DISTINCT id) AS objects,
  sum(pg_column_size(content)) AS stored_content_bytes,min(created_at) AS oldest,max(created_at) AS newest
  FROM knowledge75.revisions GROUP BY kind ORDER BY kind)x""")
 if 'knowledge75.publication_generations' in names:
  result['publicationGenerations']=read("""SELECT json_build_object(
  'total',count(*),'ready',count(*) FILTER(WHERE state='ready'),
  'staged',count(*) FILTER(WHERE state='staged'),'failed',count(*) FILTER(WHERE state='failed'),
  'retained_record_copies',coalesce(sum(record_count),0),
  'active_record_count',coalesce(max(record_count) FILTER(WHERE id=(SELECT active_generation FROM knowledge75.publication_control WHERE singleton)),0),
  'oldest',min(created_at),'newest',max(created_at),
  'last_24h_generations',count(*) FILTER(WHERE created_at>=now()-interval '24 hours'),
  'last_24h_record_copies',coalesce(sum(record_count) FILTER(WHERE created_at>=now()-interval '24 hours'),0))
  FROM knowledge75.publication_generations""")
  result['publicationByDay']=read("""SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT created_at::date AS day,count(*) AS generations,sum(record_count) AS record_copies,max(record_count) AS largest_record_count
  FROM knowledge75.publication_generations GROUP BY created_at::date ORDER BY day DESC LIMIT 30)x""")
 if 'knowledge75.target_inventory_runs' in names:
  result['targetInventories']=read("""SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT origin,state,count(*) AS runs,min(created_at) AS oldest,max(created_at) AS newest,
  count(*) FILTER(WHERE created_at>=now()-interval '24 hours') AS last_24h_runs
  FROM knowledge75.target_inventory_runs GROUP BY origin,state ORDER BY origin,state)x""")
 if 'knowledge75.target_inventory_entries' in names:
  result['inventoryIndexes']=read("""SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT indexname,indexdef,pg_relation_size(('knowledge75.'||indexname)::regclass) AS bytes
  FROM pg_indexes WHERE schemaname='knowledge75' AND tablename='target_inventory_entries')x""")
 if 'theme_production.cases' in names:
  result['productionCases']=read("""SELECT coalesce(json_agg(x),'[]') FROM (
  SELECT phase,status,count(*) AS cases,sum(pg_column_size(progress)) AS stored_progress_bytes
  FROM theme_production.cases GROUP BY phase,status ORDER BY phase,status)x""")
 result['connectionSummary']=read("""SELECT json_build_object('connections',count(*),'waiting_on_lock',count(*) FILTER(WHERE wait_event_type='Lock'),'idle_in_transaction',count(*) FILTER(WHERE state='idle in transaction')) FROM pg_stat_activity WHERE datname=current_database()""")
 return result
