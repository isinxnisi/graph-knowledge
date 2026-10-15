# 広告の地域別初期設定用データ

DB-IP Country Lite 2026-10の日本範囲だけを抽出・隣接範囲を結合した派生データ。KGとは独立。

- 原本: https://download.db-ip.com/free/dbip-country-lite-2026-10.csv.gz
- 提供者: IP Geolocation by DB-IP — https://db-ip.com
- ライセンス: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- 原本checksum・変換内容はJSONに保持。読み込み元の設定画面にも提供者リンクを表示する。
- 更新: `python3 scripts/update-advertising-country.py YYYY-MM`。必要に応じて `--archive` で取得済みの公式CSV.gzを使える。
- 発行月初から90日を超える表・地域不明は広告の事前許可へ戻る。

個人の位置を保証するものではない。国判定はサーバー内で行い、利用者のIPを外部の位置情報APIへ送信しない。
