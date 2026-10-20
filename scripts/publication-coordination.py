#!/usr/bin/env python3
"""Opt-in publication coordination; never stops a Worker or changes its configuration.
Uses an independent Git cache and existing approved execution controls. No automatic timeout/resume.
"""
import argparse
import contextlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import tempfile

HERE = Path(__file__).resolve().parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod

e = load('coord_executor', 'publication-executor.py')
w = load('coord_worker', 'collection-worker.py')


class Coordinator:
    def __init__(self, config):
        self.config = config; self.home = Path(config['workerHome'])
        self.directory = Path(config['journalDir']); self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        e.trusted(self.directory, os.geteuid(), True)
        # Do not touch the running Worker's Git cache/head or state.
        self.store = w.GitHubStore(self.directory, config['remote'], config['branch'])
        self.prefix = 'collection-control/controls/' + w.slug(config['workerId']) + '/'
    def path(self, nonce): return self.directory / (e.nonce_id(nonce) + '.json')
    def latest(self):
        self.store.sync()
        # Validate the entire chain using the SAME parser/admission controls as the Worker.
        class Reader:
            slug = staticmethod(w.slug); human = staticmethod(w.human)
            def checkpoint(self): pass
        reader = Reader(); reader.config = {'workerId': self.config['workerId']}; reader.state = {}; reader.store = self.store
        control = w.controls.ExecutionControl(reader); control.refresh()
        e.require(not control.value.get('error'), 'Invalid/forked execution control history')
        return control.value
    def ticket(self, value):
        e.nonce_id(value['nonce']); e.nonce_id(value['ticketId'])
        e.require(value['workerId'] == self.config['workerId'] and value['codeCommit'] == self.config['codeCommit']
            and type(value['generation']) is int and value['generation'] > 0, 'Wrong fixed Worker/ticket')
        return {k: value[k] for k in e.exclusion.IDENTITY}
    def cas(self, command):
        """Only rebase on unrelated status commits; NEVER rebase over another control."""
        path = self.prefix + command['id'] + '.json'
        content = e.canonical(command)
        for attempt in range(4):
            current = self.latest()
            paths = self.store.tree(self.store.head, self.prefix)
            if path in paths:
                e.require(self.store.blob(path) == content, 'Existing control identity changed')
                e.require(current['lastControlId'] == command['id'], 'Another control followed; human review required')
                return
            e.require((current['revision'], current['lastControlId']) ==
                (command['revision'] - 1, command['previousControlId']), 'Concurrent control; no blind pause/resume')
            with tempfile.TemporaryDirectory(dir=self.directory, prefix='cas-index-') as tmp:
                env = {'GIT_INDEX_FILE': str(Path(tmp) / 'index'), 'GIT_AUTHOR_NAME': 'Publication Coordinator',
                    'GIT_AUTHOR_EMAIL': 'publication@users.noreply.github.com', 'GIT_COMMITTER_NAME': 'Publication Coordinator',
                    'GIT_COMMITTER_EMAIL': 'publication@users.noreply.github.com'}
                self.store.git('read-tree', self.store.head, env=env)
                blob = self.store.git('hash-object', '-w', '--stdin', data=content).decode().strip()
                self.store.git('update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + path, env=env)
                tree = self.store.git('write-tree', env=env).decode().strip()
                commit = self.store.git('commit-tree', tree, '-p', self.store.head,
                    data='公開と受入の実行制御を記録\n'.encode(), env=env).decode().strip()
                try:
                    self.store.git('push', 'origin', commit + ':refs/heads/' + self.config['branch']); return
                except RuntimeError:
                    if attempt == 3: raise
    def command(self, action, nonce, previous, decision):
        w.human(decision)
        return {'schemaVersion': 1, 'id': 'pub-' + nonce + '-' + ('pause' if action == 'pause-new' else 'resume'),
            'workerId': self.config['workerId'], 'revision': previous['revision'] + 1,
            'previousControlId': previous['lastControlId'], 'status': 'approved',
            'approvalScope': 'worker-execution-control-only', 'humanDecision': decision, 'action': action}
    def pause(self, ticket, decision):
        identity = self.ticket(ticket); nonce = identity['nonce']
        with e.locked(self.directory / 'coordinator.lock'):
            path = self.path(nonce)
            if path.exists():
                journal = e.read(path); e.require(journal['ticket'] == identity, 'Ticket rebound')
            else:
                previous = self.latest()
                e.require(previous['pauseMode'] is None, 'Existing operator pause must be preserved')
                journal = {'ticket': identity, 'pause': self.command('pause-new', nonce, previous, decision)}
                e.durable(path, journal)  # Intent BEFORE push. Retry discovers exactly the same control.
            e.durable(path, journal)
            self.cas(journal['pause']); return journal
    @contextlib.contextmanager
    def barrier(self):
        # Match Worker order. Both are nonblocking: never wait holding either lock.
        with e.locked(self.directory / 'coordinator.lock'):
            with e.locked(self.home / 'worker.lock'):
                with e.locked(Path(self.config['commonLock'])): yield
    def pause_proof(self, challenge):
        identity = self.ticket(challenge['exclusion']); journal = e.read(self.path(identity['nonce']))
        e.require(journal['ticket'] == identity, 'Stale ticket/generation')
        latest = self.latest(); command = journal['pause']
        actual = e.read(self.home / 'config.json')
        e.require(actual['workerId'] == identity['workerId'] and actual['codeCommit'] == identity['codeCommit']
            and all(actual[k] == self.config[k] for k in ['remote', 'branch']), 'Worker code/config differs')
        state = e.read(self.home / 'state.json')['executionControl']
        checksum = e.digest(command)
        for value in [latest, state]:
            e.require(not value.get('error') and not value.get('activeAttempt') and value['pauseMode'] == 'pause-new'
                and (value['revision'], value['lastControlId'], value['lastControlSha256']) ==
                (command['revision'], command['id'], checksum), 'Await exact durable pause acknowledgement/quiescence')
        # Caller holds both real OS locks through the remote exchange.
        return {'workerId': identity['workerId'], 'codeCommit': identity['codeCommit'], 'controlId': command['id'],
            'revision': command['revision'], 'controlSha256': checksum, 'controlHead': self.store.head, 'quiescent': True}
    def closure(self, signed, journal):
        config = self.config
        payload = e.policy.verify_signature(signed, Path(config['serverKey']), config['serverKeySha256'])
        e.require(payload['schemaVersion'] == 1 and payload['purpose'] == 'publication-exclusion-closed'
            and payload['phase'] in ['closed', 'cancelled']
            and all(payload[k] == v for k, v in journal['ticket'].items()), 'Closure ticket differs')
        expected = {'controlId': journal['pause']['id'], 'revision': journal['pause']['revision'],
            'controlSha256': e.digest(journal['pause'])}
        e.require(payload['pause'] == expected, 'Closure does not cover this exact pause')
        return payload
    def resume(self, signed, decision):
        nonce = e.nonce_id(signed['payload']['nonce'])
        with e.locked(self.directory / 'coordinator.lock'):
            path = self.path(nonce); journal = e.read(path); self.closure(signed, journal)
            if 'resume' not in journal:
                previous = self.latest()
                e.require(previous['lastControlId'] == journal['pause']['id'] and previous['pauseMode'] == 'pause-new',
                    'Another operational control followed; preserve it')
                journal.update(closure=signed, resume=self.command('resume', nonce, previous, decision))
                e.durable(path, journal)
            e.require(journal['closure'] == signed, 'Closure changed')
            e.durable(path, journal)
            self.cas(journal['resume']); return journal
    def resume_proof(self, challenge):
        nonce = challenge['nonce']; journal = e.read(self.path(nonce))
        self.closure(challenge['closure'], journal)
        e.require(self.ticket(challenge['exclusion']) == journal['ticket'] and 'resume' in journal
            and journal['closure'] == challenge['closure'], 'Resume not durably recorded')
        latest = self.latest(); command = journal['resume']
        e.require((latest['revision'], latest['lastControlId'], latest['lastControlSha256']) ==
            (command['revision'], command['id'], e.digest(command)), 'Resume Git record changed/followed')
        return {'controlId': command['id'], 'revision': command['revision'], 'previousControlId': command['previousControlId'],
            'closureSha256': e.digest(challenge['closure'])}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--config', type=Path, required=True)
    cli.add_argument('--document', type=Path, required=True, help='Saved server ticket or signed closure (no private keys)')
    cli.add_argument('--human-decision', type=Path, required=True, help='Explicit operational pause/conditional-resume decision')
    cli.add_argument('command', choices=['pause', 'resume'])
    args = cli.parse_args(); e.trusted(args.config, os.geteuid())
    coordinator = Coordinator(e.read(args.config)); decision = e.read(args.human_decision); document = e.read(args.document)
    result = getattr(coordinator, args.command)(document, decision)
    print(json.dumps({'nonce': result['ticket']['nonce'], 'control': result[args.command]['id']}))

if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, RuntimeError, subprocess.SubprocessError):
        print('{"error":"publication-coordination-stopped","workerResumeAuthorized":false}'); raise SystemExit(1)
