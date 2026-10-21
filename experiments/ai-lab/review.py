"""Deterministic human review packet. Never edits or approves evaluation labels."""
from pathlib import Path
import argparse
from core import HERE, candidates, digest, file_hash, index, load_snapshot, read_json, require

REASONS = {
    'pluto-supervisor': '第1巻の明示SUPERVISIONだけを監修の根拠とする。同じ人物へのRole未指定Claimを正解へ読み替えない。',
    'pluto-no-outgoing': '固定部分集合ではPLUTOを主語とする該当Claimがなく、指定方向の候補を完走した。世界全体の不存在ではない。',
    'pluto-limited': '候補上限1件で探索が未完了。監修者が存在しないとは言えず、STOPではなくHOLDとする案。',
    'pluto-other-work': '浦沢直樹を介し、両段にAUTHORSHIPが明示された別作品へ進む。各巻のISBNを保持し、作品間の直接関係を作らない。',
}


def packet():
    data, manifest = load_snapshot()
    tasks = read_json(HERE / 'data/tasks.json')['tasks']
    labels = read_json(HERE / 'evaluation/development-labels.json')
    entities, citations, sources = (index(data[k]) for k in ('entities', 'citations', 'sources'))
    rows = []
    for task in tasks:
        generated = candidates(data, task)
        label = labels['tasks'][task['id']]
        require(label['taskSha256'] == digest(task), 'review_task_changed')
        require(label['reviewStatus'] == 'pending-human', 'review_packet_requires_pending_labels')
        require(set(label['acceptable']) <= {c['id'] for c in generated['items']} | {'STOP', 'HOLD'}, 'review_choice_missing')
        rows.append({'task': task, 'taskSha256': digest(task), 'candidates': generated,
                     'expectedDraft': label['acceptable'], 'reviewStatus': 'pending-human',
                     'rationale': REASONS[task['id']], 'labelOrigin': label['origin']})
    return {'schemaVersion': 1, 'reviewStatus': 'pending-human', 'approvalRecorded': False,
            'kgRevision': manifest['revision'] if 'revision' in manifest else manifest.get('publicRevision'),
            'kgSha256': manifest['snapshotSha256'], 'labelsSha256': file_hash(HERE / 'evaluation/development-labels.json'),
            'evaluationVersion': labels['version'], 'rows': rows,
            'entities': entities, 'citations': citations, 'sources': sources}


def markdown(value):
    lines = ['# 関係探索AI：4課題の一括レビュー資料', '',
             '**全件がAI作成の採点案・人間未承認です。この資料の生成や閲覧で正式な正解にはなりません。**', '',
             '確認対象：探索目的、方向・段数・取得上限、候補ごとのRole/ISBN/元Claim、期待する選択・STOP・HOLD。',
             '確認時は課題IDとtask hash、承認／修正／保留、理由をまとめて指定してください。承認記録・評価版の更新は別工程です。', '',
             f"固定KG SHA-256: `{value['kgSha256']}`", f"採点案 SHA-256: `{value['labelsSha256']}`", '',
             'Graphリンクは現在の公開KGを開きます。評価時の固定snapshotとは版が異なる場合があります。', '']
    for row in value['rows']:
        task, generated = row['task'], row['candidates']
        lines += [f"## {task['id']}", '', task['objective'], '', f"Task hash: `{row['taskSha256']}`", '',
                  f"方向 `{task['filters']['direction']}` / {task['limits']['depth']}段 / 候補上限{task['limits']['candidates']} / 辺確認上限{task['limits']['edgeChecks']}",
                  f"Roleフィルター: `{task['filters']['roles']}` / ISBNフィルター: `{task['filters']['isbn13']}` / 既訪問: `{task['visited']}`", '',
                  f"固定範囲の取得完了: {generated['completeWithinSnapshot']} / 提示候補: {len(generated['items'])} / 確認辺: {generated['edgeChecks']}", '',
                  '期待結果案: ' + ', '.join(f'`{x}`' for x in row['expectedDraft']), '', row['rationale'], '',
                  '選択肢は下記候補にSTOPとHOLDを加えたもの。未完了集合でのSTOPは禁止。', '']
        for c in generated['items']:
            lines += [f"### {c['targetName']} — `{c['id']}`", '',
                      f"[現在のGraph](https://plunode.net/explore/{c['targetId']})", '']
            for step in c['path']:
                role = (step.get('contribution') or {}).get('roleId')
                scope = (step.get('contribution') or {}).get('scope') or {}
                lines += [f"- 元Claim: {value['entities'][step['subjectId']]['name']} → {value['entities'][step['objectId']]['name']} / CONTRIBUTED_TO / {step['polarity']}",
                          f"- 辿り方: {step['direction']} / Role: {role or '未指定'} / ISBN: {scope.get('isbn13', '未指定')} / 巻: {scope.get('volumeLabel', '未指定')}",
                          f"- [Claim {step['claimId']}](https://plunode.net/?read=claim&dataset=public-kg&id={step['claimId']})"]
                for cid in step['citationIds']:
                    ci = value['citations'][cid]; source = value['sources'][ci['sourceId']]
                    lines += [f"- Citation `{cid}` / stance: {ci['stance']} / locator: {ci.get('locator')} / note: {ci.get('note')}",
                              f"- Source `{source['id']}`: {source.get('title')} — {source.get('url')}"]
                lines += ['']
        lines += ['確認欄：□承認　□修正　□保留 ／ 判断者・日時・理由：未記入', '']
    return '\n'.join(lines).rstrip() + '\n'


def main():
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--token', help='existing common hold token; required when writing')
    args = parser.parse_args()
    if not args.check:
        from runtime import held
        require(args.token, 'common_lock_token_required')
        held(args.token)
    value = packet()
    files = {'review.json': json.dumps(value, ensure_ascii=False, indent=2) + '\n', 'REVIEW.md': markdown(value)}
    for name, text in files.items():
        path = args.output / name
        if args.check:
            require(path.read_text() == text, 'review_packet_stale')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('x') as out:
                out.write(text)
    print('4 tasks; pending-human; labels unchanged')


if __name__ == '__main__':
    main()
