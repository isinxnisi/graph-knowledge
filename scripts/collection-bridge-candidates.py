#!/usr/bin/env python3
"""Issue #34 planning artifact check. Offline topology only; never emits fixture Claims."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = 'datasets/connectivity/issue-34-candidates/candidates.json'
OUTPUT = 'datasets/connectivity/issue-34-candidates/analysis.json'
FIXTURE = 'datasets/connectivity/issue-34/after-data.json.gz'
REPORT = 'datasets/connectivity/issue-34/report/report.json'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def input_bytes(path):
    raw = path.read_bytes()
    return raw if path.suffix == '.gz' else raw.replace(b'\r\n', b'\n')


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def graph(nodes, edges):
    adjacency = {key: set() for key in nodes}
    for a, b in edges:
        require(a in nodes and b in nodes, 'Unknown edge endpoint')
        if a != b:
            adjacency[a].add(b)
            adjacency[b].add(a)
    owner, groups = {}, {}
    for start in sorted(nodes):
        if start in owner:
            continue
        queue = [start]
        owner[start] = start
        for key in queue:
            for other in sorted(adjacency[key]):
                if other not in owner:
                    owner[other] = start
                    queue.append(other)
        groups[start] = sorted(queue)
    return adjacency, owner, groups


def reach(adjacency, root):
    seen, frontier, result = {root}, {root} if root in adjacency else set(), []
    for _ in range(3):
        next_nodes = set().union(*(adjacency[key] for key in frontier)) - seen if frontier else set()
        seen |= next_nodes
        result.append(seen - {root})
        frontier = next_nodes
    return result


def scenario(nodes, edges, hypotheses, proposed, roots, islands, pre50):
    # proposal:* keys are analysis placeholders, never Entity UUIDs or Claim records.
    additional = {key for h in hypotheses for key in [h['subjectKey'], h['objectKey']] if key not in nodes}
    require(additional <= proposed.keys(), 'Unspecified proposed endpoint')
    next_nodes = {**nodes, **{key: proposed[key] for key in sorted(additional)}}
    next_edges = edges + [(h['subjectKey'], h['objectKey']) for h in hypotheses]
    before, old_owner, old_groups = graph(nodes, edges)
    after, next_owner, next_groups = graph(next_nodes, next_edges)
    old_island_ids = {row['id'] for row in islands}
    remaining = {next_owner[row['entityIds'][0]] for row in islands
                 if not set(next_groups[next_owner[row['entityIds'][0]]]) & pre50}
    merged = []
    for key, members in next_groups.items():
        original = sorted({old_owner[node] for node in members if node in nodes})
        if len(original) > 1:
            merged.append({'existingComponentIds': original, 'conditionalEntityCount': len(members),
                           'includesOriginalNewIslandIds': sorted(set(original) & old_island_ids)})
    root_rows = []
    for root in roots:
        old_reach, next_reach = reach(before, root), reach(after, root)
        root_rows.append({'rootKey': root, 'name': next_nodes.get(root, proposed.get(root, {})).get('name', root),
                          'beforeWithinHops': [len(s) for s in old_reach],
                          'conditionalWithinHops': [len(s) for s in next_reach],
                          'newEndpointKeysWithinHops': [sorted(b - a) for a, b in zip(old_reach, next_reach)],
                          'beforeNeighborCount': len(before.get(root, set())),
                          'conditionalNeighborCount': len(after.get(root, set()))})
    return {'assumption': 'all listed hypotheses become valid, supported, affirmative public Claims after separate review',
            'notObservedKG': True, 'hypothesisKeys': [h['key'] for h in hypotheses],
            'newUnconfirmedNodeKeys': sorted(additional),
            'componentCountBefore': len(old_groups), 'conditionalComponentCount': len(next_groups),
            'conditionalComponentDelta': len(next_groups) - len(old_groups),
            'conditionalTotalEntityCount': len(next_nodes), 'mergedCurrentGroups': merged,
            'remainingIndependentComponentsFromOriginal18': len(remaining),
            'conditionalBranchingEntityDelta': sum(len(a) >= 2 for a in after.values()) - sum(len(a) >= 2 for a in before.values()),
            'rootReachability': root_rows,
            'reachabilityScope': 'exact cumulative <=1/2/3 distinct endpoints for these roots only; structural, not UI/API capability'}


def build(root=ROOT):
    root = root.resolve()
    reads = {}

    def read(file, expected=None):
        path = (root / file).resolve()
        require(path.is_relative_to(root), 'Input outside repository')
        raw = input_bytes(path)
        require(not expected or digest(raw) == expected, 'Input checksum mismatch: ' + file)
        reads[file] = digest(raw)
        return raw.decode('utf-8') if file.endswith('.md') else json.loads(gzip.decompress(raw) if file.endswith('.gz') else raw)

    spec = read(INPUT)
    require(spec['schemaVersion'] == 1 and spec['authority'] == 'human-planning-only-not-collection-permission', 'Not a planning input')
    require(spec['execution'] == {'collectorRequests': False, 'providerNetworkCalls': 0, 'acceptance': False,
                                  'publicApply': False, 'workerChanges': False}, 'Planning must not contain execution permission')
    inputs = {ref['file']: read(ref['file'], ref['sha256']) for ref in spec['inputs']}
    require(len(inputs) == len(spec['inputs']), 'Duplicate input reference')
    fixture, previous = inputs[FIXTURE], inputs[REPORT]
    manifest = inputs['datasets/connectivity/issue-34/after-manifest.json.gz']
    require(digest(gzip.decompress((root / FIXTURE).read_bytes())) == manifest['dataSha256'], 'Published data/manifest mismatch')
    require(inputs['datasets/connectivity/issue-34/public-observation.json']['revision'] == spec['expectedRevision'], 'Saved revision mismatch')
    require(previous['provenance']['publicObservation']['revision'] == spec['expectedRevision'], 'V1 report revision mismatch')
    nodes = {e['id']: e for e in fixture['entities']}
    all_claims = {c['id']: c for c in fixture['claims']}
    sources = {s['id']: s for s in fixture['sources']}
    supporting = {c['claimId'] for c in fixture['citations'] if c['stance'] == 'support' and not sources[c['sourceId']]['isDemo']}
    claims = {key: c for key, c in all_claims.items() if c['polarity'] == 'affirmed' and c['visibility'] == 'published' and key in supporting}
    edges = [(c['subjectId'], c['objectId']) for c in claims.values()]
    _, owner, groups = graph(nodes, edges)
    require(len(nodes) == previous['after']['entityCount'] and len(claims) == previous['after']['claimCount']
            and len(groups) == previous['after']['componentCount'], 'Input differs from verified V1 graph')
    islands = previous['delta']['isolatedNewGroups']
    require(len(islands) == 18 and all(groups[row['id']] == row['entityIds'] for row in islands), 'Original 18 island membership differs')
    pre50 = {key for row in previous['before']['components'] for key in row['entityIds']}
    themes, evidence_ids, covered, all_hypotheses, proposed = [], set(), defaultdict(list), [], {}
    require(3 <= len(spec['themes']) <= 5, 'Expected 3-5 themes')
    for theme in spec['themes']:
        for node in theme['proposedNodes']:
            require(node['key'].startswith('proposal:') and node['key'] not in nodes and node['key'] not in proposed, 'Invalid/duplicate hypothetical node')
            proposed[node['key']] = node
        for h in theme['hypotheses']:
            require(h['status'] == 'unconfirmed-not-a-Claim' and 'id' not in h and 'claimId' not in h, 'Hypothesis must not be a Claim record')
            require(h['predicateCandidate'] == 'CONTRIBUTED_TO', 'V1 planning only supports contribution hypotheses')
            require(h['scope'] is None, 'Unverified publication scope must remain null')
            subject = nodes.get(h['subjectKey'], proposed.get(h['subjectKey']))
            object_ = nodes.get(h['objectKey'], proposed.get(h['objectKey']))
            require(subject and subject['kind'] == 'person' and object_ and object_['kind'] == 'work', 'Wrong contribution endpoint kind')
            require((h['subjectKey'], h['objectKey']) not in edges, 'Already published relationship must be reused')
        evidence_ids.update(theme['establishedClaimIds'])
        require(set(theme['establishedClaimIds']) <= claims.keys(), 'Established evidence is not public/eligible')
        for anchor in theme['islandAnchors']:
            require(anchor in owner and owner[anchor] in {row['id'] for row in islands}, 'Theme must address an original island')
            covered[owner[anchor]].append(theme['key'])
        all_hypotheses += theme['hypotheses']
    require(len({h['key'] for h in all_hypotheses}) == len(all_hypotheses), 'Duplicate hypothesis key')
    hypothetical = {h['key']: h for h in all_hypotheses}
    for theme in spec['themes']:
        paths = []
        local_hypotheses = {h['key'] for h in theme['hypotheses']}
        for route in theme['paths']:
            keys = route['nodeKeys']
            require(len(keys) == len(route['steps']) + 1 and 2 <= len(route['steps']) <= 3 and len(set(keys)) == len(keys), 'Invalid 2-3 hop simple path')
            steps = []
            for index, step in enumerate(route['steps']):
                if 'claimId' in step:
                    require(step['claimId'] in theme['establishedClaimIds'], 'Path Claim outside declared evidence')
                    c = claims[step['claimId']]
                    a, b = c['subjectId'], c['objectId']
                    state = {'status': 'published', 'claimId': c['id']}
                else:
                    require(step['hypothesisKey'] in local_hypotheses, 'Unknown/cross-theme hypothesis')
                    h = hypothetical[step['hypothesisKey']]
                    a, b = h['subjectKey'], h['objectKey']
                    state = {'status': 'unconfirmed', 'hypothesisKey': h['key'], 'roleCandidates': h['roleCandidates']}
                require({a, b} == set(keys[index:index + 2]), 'Path does not match original endpoints')
                steps.append({**state, 'traversal': 'forward' if a == keys[index] else 'reverse'})
            paths.append({'label': route['label'], 'names': [(nodes.get(key) or proposed[key])['name'] for key in keys],
                          'nodeKeys': keys, 'hops': len(steps), 'status': 'conditional' if any(s['status'] == 'unconfirmed' for s in steps) else 'published', 'steps': steps})
        themes.append({**theme, 'paths': paths,
                       'conditionalEffect': scenario(nodes, edges, theme['hypotheses'], proposed, theme['rootKeys'], islands, pre50),
                       'singleHypothesisEffects': [scenario(nodes, edges, [h], proposed, theme['rootKeys'], islands, pre50) for h in theme['hypotheses']]})
    citation_rows = [c for c in fixture['citations'] if c['claimId'] in evidence_ids]
    source_ids = {c['sourceId'] for c in citation_rows}
    roots = sorted({key for t in spec['themes'] for key in t['rootKeys']})
    result = {'schemaVersion': 1, 'readOnly': True, 'authority': 'planning-only-awaiting-human-scope-and-budget',
              'revision': spec['expectedRevision'], 'fixedAnalysisCommit': spec['fixedCommit'],
              'freshness': 'saved V1 published bundle/observation; no provider or live KG re-fetch',
              'inputHashPolicy': 'gzip: raw bytes; tracked text: UTF-8 with CRLF normalized to LF for Windows/WSL reproducibility',
              'inputSha256': reads[INPUT], 'verifiedInputs': reads,
              'currentGraph': {'entityCount': len(nodes), 'eligibleClaimCount': len(claims), 'componentCount': len(groups)},
              'original18': [{**row, 'names': [nodes[key]['name'] for key in row['entityIds']],
                              'selectedThemes': covered.get(row['id'], []),
                              'disposition': 'selected-for-planning' if covered.get(row['id']) else 'deferred-no-new-verified-bridge-source'} for row in islands],
              'representativeCurrentGroups': [{'anchor': nodes[key]['name'], 'componentId': owner[key], 'entityCount': len(groups[owner[key]])}
                                              for key in roots if nodes[key]['name'] in ['アイシールド21', '小畑健', 'ONE', '赤坂アカ', 'あだち充']],
              'themes': themes, 'combinedConditionalEffect': scenario(nodes, edges, all_hypotheses, proposed, roots, islands, pre50),
              'publishedEvidence': {'entities': [nodes[key] for key in sorted({key for cid in evidence_ids for key in [claims[cid]['subjectId'], claims[cid]['objectId']]})],
                                    'claims': [claims[key] for key in sorted(evidence_ids)],
                                    'citations': sorted(citation_rows, key=lambda c: c['id']), 'sources': [sources[key] for key in sorted(source_ids)]},
              'sideEffects': spec['execution']}
    require(all(digest(input_bytes(root / file)) == value for file, value in reads.items()), 'Input changed during analysis')
    return result


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true', help='Compare saved analysis without writing')
    args = cli.parse_args()
    result, target = build(), ROOT / OUTPUT
    content = dump(result)
    if target.exists():
        require(target.read_text(encoding='utf-8') == content, 'Existing analysis differs; no overwrite')
    else:
        require(not args.check, 'Analysis output missing')
        with target.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
    print(dump({'status': 'verified', 'readOnly': True, 'themes': len(result['themes']), 'output': OUTPUT}).strip())


if __name__ == '__main__':
    main()
