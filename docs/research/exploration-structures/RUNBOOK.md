# 手動で再観測し、入力の版を比較する

Python標準ライブラリだけで実行する。日次スケジューラー、AI呼出し、DB接続、収集・受入・公開操作はない。公開APIへのPOSTは、既存の読み取り専用 `/api/discovery/paths` に限る。

## 保存された初回を再現する

独立worktreeで、変更・検証・commit前の共通holdとtoken確認を行う。初回の研究branchを後日再現する場合は、そのcommitをcheckoutする。

```bash
python3 scripts/exploration-structures.py --check
python3 -m unittest discover -s tests -p test_exploration_structures.py -v
python3 scripts/collection-bridge-candidates.py --check
git diff --check
```

`--check` は通信しない。保存gzipのhash、出典・検索コード・定義のhash、観測前後のrevision、各API本文のcanonical hash、起点のcursor連続性、代表経路の正規方向・支持Citation、正式receiptとの対応、保存結果の一致を検証する。元HTTP応答byteのSHA-256は取得証跡として残し、オフライン照合は保存JSONのcanonical hashを使う。

検索コードや定義が後日変わると、古い観測の再分析は `Source/input drift` 等で停止する。**古いhashを書き換えない**。古いcommitの独立worktreeで再現するか、生成済みの `observations.json` 同士を下記の比較コマンドで読む。比較だけなら旧コードhashとの再照合を要求しない。

## 新しい観測時点を決める

調査・待機中は共有ロックを占有しない。作業用の `/tmp` に新しい公開応答・固定control資料を保存し、終了時点を一回決める。プロジェクトへの配置、検証、commit・pushの区切りだけ共通holdを取得し、token付きreview／assert-heldを行う。既存Workerのmirror・state・config・lockは変更しない。

1. 最新mainから独立worktreeを作る。`make autopilot-review` で未反映・dirty・実行中を確認し、自動branchを無条件に受け入れない。
2. control branchのSHAを一度確認し固定する。新しいSHAが必要なら接続GitHubツール、または**調査専用の別mirror**へ取得する。正式runtimeのmirrorでfetchしない。
3. 固定SHAから下記4ファイルを保存する。初回は `c189e0634c5c18596df968f68a48003da2153056`。別の候補・正式receiptが増えた場合は取得範囲を明示して追加する。4ファイルだけで全Workerの棚卸し済みとはしない。

```bash
control_sha=確認した40桁のSHA
research_mirror=$(mktemp -d /tmp/plunode-research-control.XXXXXX)
git init --bare "$research_mirror"
git --git-dir "$research_mirror" fetch --depth=1 \
  https://github.com/isinxnisi/graph-knowledge.git "$control_sha"
python3 - "$research_mirror" "$control_sha" /tmp/plunode-control-observation.json <<'PY'
import hashlib, json, pathlib, subprocess, sys
mirror, commit, output = sys.argv[1:]
prefix = 'collection-control/artifacts/issue-16-adachi-three-20261025/.local/collection-issues/issue-16-adachi-three-20261025/'
paths = ['collection-control/results/issue-16-adachi-three-20261025/' + name
         for name in ['README.md', 'status.json']]
paths += [prefix + name for name in ['reused-reviews.json', 'preparation.json']]
rows = []
for path in paths:
    raw = subprocess.check_output(['git', '--git-dir', mirror, 'show', commit + ':' + path])
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    rows.append({'path': path, 'sha256': hashlib.sha256(raw).hexdigest(),
                 'blobSha1': blob, 'content': raw.decode()})
target = pathlib.Path(output)
assert not target.exists(), 'Use a new file; preserve the previous observation'
target.write_text(json.dumps({'commit': commit, 'files': rows}, ensure_ascii=False, indent=2) + '\n')
PY
```

4. 公開APIを一回取得する。下記 `--runtime` は**読取先**で、正式受入を呼ばない。既存 `Inventory.formal_receipts` の検証とreadsetの前後hash照合を再利用する。新しい保存先を指定し、初回観測へ上書きしない。

```bash
python3 scripts/exploration-structures-capture.py \
  --previous datasets/exploration-structures/20261026 \
  --output /tmp/plunode-exploration-NEW_OBSERVATION \
  --runtime "$HOME/.local/share/plunode-collection-worker-phase-b-20261020/runtime" \
  --control /tmp/plunode-control-observation.json
```

固定18 UUIDのEntity・全近傍・各Claim根拠を取得し、前回の名前検索・経路能力probeを最新revisionで再実行する。近傍は50件/ページ・30ページ/起点、各応答4 MiB、要求25秒で打ち切る。対象が消えた・ページが完走しない・期間中にrevisionが変わった場合は確定しない。失敗を0件結果へ代用せず、別時点を選ぶ。再試行を定期化しない。

GET経路APIの20/24/128/12上限はそのまま記録する。POST経路probeは最初の候補ページのみで、`hasMore=true` なら部分結果。全近傍を読み終えたことと、全KGの全経路を列挙したことは異なる。新しいAPI引数が必要になったらprobeの意味を先に記録し、前回と同一条件だと装わない。

5. `/tmp` の結果を読み、必要なら同定・意味の保留を追記する。公開APIで正式受入済みUUIDが見えなくても、撤回や差替えを調べずに公開待ちへ戻さない。正式受入未公開を確定したい場合は、既存の[棚卸しCLI](../../design/COLLECTION_INVENTORY.md)と検証済み最新backupによる撤回を含む照合が必要。今回の小群API観測で代用しない。
6. 内容を確定後、共通hold中に新しい日付ディレクトリへコピーし、検証・日本語commit・upstreamへの通常pushを行う。Web変更がないので再build・配置は不要。3200／beta／本番の観測差・取得失敗は報告する。

## 二つの観測を比較する

```bash
python3 scripts/exploration-structures.py --compare \
  datasets/exploration-structures/20261026/observations.json \
  /tmp/plunode-exploration-NEW_OBSERVATION/observations.json
```

| 差分の軸 | 読み方 |
| --- | --- |
| Claim追加／削除 | 同じ取得コホート・範囲かを先に確認。公開追加と受入日を同一視しない |
| 同UUIDの条件field変更 | Role・period・scope等の差を出す。表記修正か意味変更かは別レビューで確定する |
| evidenceChanged | Citation／Sourceの差。Claim条件の差と分ける |
| searchCodeChanged | 監査対象の検索実装・条件型・依存lockのhash差。配置物の同一性を自動保証しない |
| apiBehaviorChanged | 同じprobeの応答件数・status・scan／pageの差。revision値だけの差は除く。データとコードのどちらが原因かは自動断定しない |
| definitionsChanged | 型／コホート・問いの定義差。旧例の件数増加と区別する |
| coverageChanged / originChanged | 起点集合・取得方針・環境の差。単なる投影の件数変化はprojectionCountsChangedで別に出す |

データとコードが両方変わったときは両方を記録し、片方の効果と決めない。切り分けが必要なら、同じ保存データ＋固定コードで対照実行する。初回の旧fixture比較は同じ18起点に接続するClaimだけを比較したもので、古いAPIの実行を再現した比較ではない。

新例が増えたら同じS1〜S4の観測を増やす。新しい問い・形・量化や時間意味が必要なら、カタログの定義版とコホート版を別途レビューする。日々の追加を理由に過去の初回資料を上書きしない。
