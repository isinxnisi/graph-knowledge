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
 if 'knowledge75.publication_record_values' in names:
  result['publicationStorage']=read("""SELECT json_build_object(
   'retained_ready_generations',(SELECT count(*) FROM knowledge75.publication_generations WHERE state='ready' AND expired_at IS NULL),
   'expired_generations',(SELECT count(*) FROM knowledge75.publication_generations WHERE expired_at IS NOT NULL),
   'retained_legacy_record_count',(SELECT coalesce(sum(record_count),0) FROM knowledge75.publication_generations WHERE content_digest IS NULL AND purged_at IS NULL),
   'record_memberships',(SELECT count(*) FROM knowledge75.publication_record_members),
   'unique_record_projections',(SELECT count(*) FROM knowledge75.publication_record_values),
   'unique_entity_projections',(SELECT count(*) FROM knowledge75.publication_entity_values),
   'first_public_record_contexts',(SELECT count(*) FROM knowledge75.publication_record_context),
   'pruned_inventory_runs',(SELECT count(*) FROM knowledge75.target_inventory_runs WHERE purged_at IS NOT NULL))""")
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


def retention_status(sql):
    """Read-only summary of the 72 hour and 7 day Worker policies after 012."""
    raw = sql("""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
      SET LOCAL statement_timeout='45000ms'; SET LOCAL lock_timeout='2s';
      WITH publication AS (
        SELECT g.*, g.id=active.id AS active,
          g.id<>active.id AND g.purged_at IS NULL AND (
            g.expired_at IS NOT NULL OR g.retired_at<now()-interval '72 hours' OR
            g.state IN ('failed','staged') AND g.created_at<active.created_at
             AND g.created_at<now()-interval '72 hours'
          ) AS eligible
        FROM knowledge75.publication_generations g
        JOIN knowledge75.publication_control ctrl ON ctrl.singleton
        JOIN knowledge75.publication_generations active ON active.id=ctrl.active_generation
      ), inventory AS (
        SELECT r.origin,r.id,r.purged_at,
          r.state IN ('stale','complete')
           AND coalesce(r.completed_at,r.created_at)<now()-interval '7 days'
           AND (r.purged_at IS NULL OR EXISTS(SELECT 1 FROM knowledge75.target_inventory_entries e WHERE e.run_id=r.id))
           AND NOT EXISTS(SELECT 1 FROM knowledge75.patrol_cycles c WHERE r.id IN (c.inventory_run,c.completed_run))
           AND NOT EXISTS(SELECT 1 FROM knowledge75.patrol_targets p
               WHERE p.origin=r.origin AND p.inventory_run=r.id AND p.present) AS eligible
        FROM knowledge75.target_inventory_runs r
      )
      SELECT json_build_object(
        'active',(SELECT json_build_object('id',id,'state',state,'expired_at',expired_at,
          'records',record_count,'graph',coalesce(graph_generation,id),
          'compact',content_digest IS NOT NULL) FROM publication WHERE active),
        'publication',(SELECT json_build_object(
          'eligible_generations',count(*) FILTER(WHERE eligible),
          'eligible_ready',count(*) FILTER(WHERE eligible AND state='ready'),
          'eligible_staged_or_failed',count(*) FILTER(WHERE eligible AND state IN ('staged','failed')),
          'eligible_legacy_record_headers',coalesce(sum(record_count) FILTER(WHERE eligible AND content_digest IS NULL),0),
          'awaiting_legacy_ready',count(*) FILTER(WHERE state='ready' AND content_digest IS NULL
            AND NOT active AND expired_at IS NULL AND NOT eligible),
          'expired_generations',count(*) FILTER(WHERE expired_at IS NOT NULL),
          'purged_generations',count(*) FILTER(WHERE purged_at IS NOT NULL),
          'retained_graph_namespaces',count(DISTINCT coalesce(graph_generation,id)) FILTER(WHERE expired_at IS NULL),
          'generated_last_24h',count(*) FILTER(WHERE created_at>=now()-interval '1 day')
        ) FROM publication),
        'next_ready_expiry',(SELECT min(retired_at)+interval '72 hours' FROM publication
          WHERE state='ready' AND NOT active AND expired_at IS NULL AND NOT eligible),
        'fixed_record_contexts',(SELECT count(*) FROM knowledge75.publication_record_context),
        'inventory',(SELECT coalesce(json_agg(stats ORDER BY origin),'[]') FROM (
           SELECT origin,count(*) FILTER(WHERE eligible) AS eligible_runs,
            count(*) FILTER(WHERE purged_at IS NOT NULL) AS marked_runs
           FROM inventory GROUP BY origin
        ) stats),
        'checkpoints',(SELECT coalesce(json_agg(json_build_object('origin',origin,'phase',phase,'inventory_run',inventory_run,
          'completed_run',completed_run,'scanned',scanned,'total',total,'error_code',error_code) ORDER BY origin),'[]')
          FROM knowledge75.patrol_cycles),
        'rows',json_build_object(
          'original_revisions',(SELECT count(*) FROM knowledge75.revisions),
          'legacy_records',(SELECT count(*) FROM knowledge75.publication_records),
          'legacy_entities',(SELECT count(*) FROM knowledge75.publication_entities),
          'inventory_entries',(SELECT count(*) FROM knowledge75.target_inventory_entries)),
        'physical',json_build_object(
          'database_bytes',pg_database_size(current_database()),
          'wal_bytes',coalesce((SELECT sum(size) FROM pg_ls_waldir()),0),
          'relations',(SELECT coalesce(json_object_agg(relname,json_build_object(
            'bytes',pg_total_relation_size(relid),'live_estimate',n_live_tup,'dead_estimate',n_dead_tup,
            'last_autovacuum',last_autovacuum)),'{}')
          FROM pg_stat_user_tables WHERE schemaname='knowledge75' AND relname IN (
             'publication_records','publication_entities','publication_record_members','publication_entity_members',
             'publication_record_values','publication_entity_values','publication_record_context','target_inventory_entries'))
        )
      );
      COMMIT""")
    return json.loads(raw)
