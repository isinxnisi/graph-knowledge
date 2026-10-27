# 公開承認待ち

release: `publication-8b0b1d67656a15c7e505ba1f`

base: `publication-film-initial-20261027` / `7c54da24-6fa9-46a5-810d-834eed8328d9`

正式受入済みの追加件数: `{"entities": 29, "claims": 34, "sources": 5, "citations": 34}`。既存更新0。

[追加レコード本文・Role/scope・根拠・依存関係](review.json)を確認する。固定資材はWSL `/home/isinxnisi/.local/share/plunode-publication/preparation/candidates/13abfb93-ba2d-44f7-a56b-352aa7ab0ab0`。

固定plan: `8e6dbf83d411acef77c2631c1dde6a466f2b8fb7a45e742371334560416ee5e7`

artifact: `9a58b3a3515c4e8fb4093a76210acc4828a8cfefc68b1dbba135b019ee41d2da`

receipt集合: `9cfd5c4f9a84d6f37ac6a58228421d76d1859d0f7e48b117b424c42495af1969`

ローカルWSLで次を実行し、表示された固定requestと根拠を確認してrelease IDを入力した場合だけ公開を承認する。

```bash
sudo /usr/local/sbin/plunode-publication-approve --nonce 13abfb93-ba2d-44f7-a56b-352aa7ab0ab0 --minutes 30 --operator-approved
```

確認入力: `publication-8b0b1d67656a15c7e505ba1f`

確認後は自動公開・検証・結果記録まで実行。承認前にapplyしない。取り消し/不整合時は同nonceを保全する。
