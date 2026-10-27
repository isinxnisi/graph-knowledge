# 公開承認待ち

release: `publication-film-initial-20261027`

base: `manga-issue-34-obata-drawing-20261023` / `b74a4b00-9454-412f-af5d-1317713a543c`

正式受入済みの追加件数: `{"entities": 3, "claims": 2, "sources": 2, "citations": 2}`。既存更新0。

[追加レコード本文・Role/scope・根拠・依存関係](review.json)を確認する。固定資材はWSL `/home/isinxnisi/.local/share/plunode-publication/preparation/candidates/6b240b18-56e4-4ea4-995f-7be7424c3fb2`。

固定plan: `16dc070797315903397389d071b4a118acdbbb5a1cdd5dd0a0f6677503d95ebc`

artifact: `055bcacb42dfe5b7c3b32cb17fece1b8748a1900fb5c7618c4faa61ffa9894d7`

receipt集合: `614a0f3ccff3854280012767f580a99427c94f72bd846a920e4dc1ed91d57ffd`

ローカルWSLで次を実行し、表示された固定requestと根拠を確認してrelease IDを入力した場合だけ公開を承認する。

```bash
sudo /usr/local/sbin/plunode-publication-approve --nonce 6b240b18-56e4-4ea4-995f-7be7424c3fb2 --minutes 30 --operator-approved
```

確認入力: `publication-film-initial-20261027`

確認後は自動公開・検証・結果記録まで実行。承認前にapplyしない。取り消し/不整合時は同nonceを保全する。
