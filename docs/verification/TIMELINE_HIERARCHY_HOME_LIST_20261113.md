# 年表の見出し・補足文とTOP一覧の整列（2026-11-13）

## 変更範囲

年表の読物表示は `readingSummary || readingTitle` を主見出しとして使っていた。`shortTitle` 由来の `readingTitle` を主見出しにし、`timelineSummary` 由来の `readingSummary` は直下の通常文字へ分離した。補足文がなければ要素も余白も作らない。文章・日付・原文・表示件数・選択ボタンと詳細への操作は変更しない。行数制限、折り畳み、装飾、誘導UIは追加していない。

作業中に追加されたTOPの指摘も反映。新着テーマのリンクを固定アイコン列とタイトル／種別の列に分け、長い題名でアイコンが取り残される折り返しを解消した。タイトルと「年表・関係図」「人物」等は文字の基準線に揃えた。文言・リンク先・データは変更していない。

## 実画面の計測

HTTPS βの黒澤テーマ構成版6、1979／1980-04-26／1990-03-26の3項目を、PC幅1920pxとスマートフォン幅375pxで確認。

| 表示要素 | 変更前 | 変更後 |
| --- | --- | --- |
| 主見出し | 補足文が14px・600・22.4pxで表示され、shortTitleが見えない | shortTitleを14px・600・22.4pxで表示 |
| 補足文 | 独立した表示なし | 11px・400・17.05px、rgb(92, 111, 131) |
| 対象名 | 10px・400・15.5px | 同じ（色も補足文と同じ） |

3項目とも補足文全文が一致し、通常折り返しでPCは1行、375pxは2行。省略・行数制限・横溢れなし。補足文のない1977-05-25の項目高は、変更前後ともPC60.890625px／375px78.890625pxで一致。補足文のある項目は必要な行数分だけ増減し、項目間余白・インデントは変更していない。

1980年の項目を選択し、同じRecordの詳細が開き「年表・図に戻る」で元の年表へ戻ることを確認した。

TOPの375px表示では、PLUTO等の長い題名・種別がアイコン右側で折り返されること、種別のalign-itemsがbaselineになったこと、横溢れがないことを確認。小さい種別の位置はPCでも同じ基準線に揃う。文字サイズの全体縮小はしていない。

## 検証・反映

- knowledge-timeline-ui／theme-timeline-ui／knowledge-timeline-translation／theme-discovery：4ファイル38件成功。
- 今回変更したTSX・テストのESLint、型検査を含む公開Web build成功。既存mission-clientの動的パストレースに関するTurbopack warningは別件。
- 実装commit `20f5c058` をmainへ通常push済み。
- build `GcXmdVX6VAkl-Y5aLvgLD` をローカル3200／HTTPS βへ反映。HTTPS応答200と実画面を確認。Webだけを切替、6本のWorker PIDファイルは前後一致。
- 構成版6のsnapshotとpresentation JSONは反映前後で完全一致。API・DB・共通品質ガイド・本番VPSは変更なし。受付修正／G07再試行／AI送信なし。
- WSLからの外向きHTTPS確認は既知のネットワーク到達不可で失敗したため、WindowsからHTTP 200とChromeからβ実画面を確認した。通信設定の変更や追加調査はしていない。

## 比較画像

保存先：`C:/Users/nishr/.codex/tmp/timeline-hierarchy-20261113/`

- 年表スマホ：`before-mobile.jpg`／`after-mobile.jpg`
- 年表PC：`before-pc.jpg`／`after-pc.jpg`
- TOPスマホ：`top-before-mobile.jpg`／`top-after-mobile.jpg`／`top-after-labels-mobile.jpg`
- 文字・行高の実測：`before-metrics.json`／`after-mobile-metrics.json`／`after-pc-metrics.json`
- TOPの実測：`top-before-metrics.json`／`top-after-mobile-metrics.json`

今回の実装・β反映・ブラウザ確認は完了。修正後のiPhone実機表示は未確認。本番は未反映。
