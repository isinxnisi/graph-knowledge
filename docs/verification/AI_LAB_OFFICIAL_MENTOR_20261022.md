# 公式AIの育成担当・コメント表示の検証

2026-10-22。`codex/ai-lab-foundation`、開始時 `ee16f9c`。共通ロックを取得・reviewし、既存の比較画像と実験成果を保全して実装した。

## 確認画面

- [育成担当・探索者見習い・デモコメント](https://graph-ailab.isinxnisi.com/ai-lab#mentorship)
- [デモコメント欄へ直接移動](https://graph-ailab.isinxnisi.com/ai-lab#mentoring-comments)
- [維持したキャラクター比較](https://graph-ailab.isinxnisi.com/ai-character-study)

| PC・明 | PC・暗 | スマホ・暗 |
| --- | --- | --- |
| [128px / 48px / 20px](official-mentor-20261022/desktop-light.png) | [同じ配置の暗テーマ](official-mentor-20261022/desktop-dark.png) | [コメント3件の縦並び](official-mentor-20261022/mobile-dark.png) |

プロフィール128px=A、育成コメント見出し48px=B、各コメント横20px=C。すべて同じ公式AIの表示参照を共用する。固定した目・球体・接続アンテナを残し、既存PNGは無加工。20pxで顔とアンテナを識別できたため、今回は極小専用アセットを追加しなかった。

探索者見習いAIは別の「観察対象」枠とし、既存ID `fe93a431-85cf-4fae-8b84-127e8bf866a7` を保持して画像を付けない。公式AIの画像を探索者へ転用していない。公式AIの正式AIIdentityは未接続で、UI参照だけをまとめる。新規アカウント・会員・権限は作らない。[参照設計](../design/AI_LAB_OFFICIAL_MENTOR.md)。

3コメントはUI表示例で、見出しと各行にDEMOを表示する。実発言・自動生成・投稿時刻・run由来を装わず、実験履歴・指標・根拠・評価データへ追加しない。従来のCodex解説も公式AIの発言へ変換していない。

## 結果

| 検証 | 結果 |
| --- | --- |
| 隔離Next production build / TypeScript | 成功 |
| HTTPS：日本語PC1440px／スマホ390px × light / dark-blue / dark-brown | 6条件成功 |
| HTTPS：英語スマホ390px・dark-blue | 成功 |
| 同一参照・A/B/C・DEMO3行・別個体・比較画面から復帰 | 7条件すべて成功 |
| コメントの配置 | アイコン20px、署名行との中心差2px未満、文字までの余白10px、本文行高24px以上。横はみ出しなし |
| 実績の不変 | 非AI5・実推論完了0・送信前保留2・追加学習済み0。実行履歴7件。デモは実行履歴に出ない |
| 通信・JavaScript | 育成表示テスト中にGET/HEAD以外の通信なし、JavaScript実行例外なし、アニメーションなし |
| 既存ラボのHTTPS回帰 | 日英×PC／スマホ4条件成功。Home・Graph・Claim・アカウント往復、Graph位置／zoom／pan復元、根拠欄・スクロール・版比較を維持 |
| API境界 | 未接続会員/auth503、推論／学習／書き込み404、非公開ファイル拒否、Host偽装拒否、CSP・レビュー資料取得成功 |
| 差分確認 | mainはbdb682b、既存memo.txtを維持。アセット・実験artifact・コミュニティ本体に変更なし |

実行：既存NodeとChromium環境で `AI_LAB_ORIGIN=https://graph-ailab.isinxnisi.com` を指定し、`prototypes/ai-lab/mentorship.test.mjs` と `prototypes/ai-lab/navigation.test.mjs` を実行した。全7条件の画像は `/tmp/plunode-mentorship-20261022/`、代表3枚を本記録と同じGitへ保存した。

反映先は既設の隔離確認環境だけ。本体3268／互換3286・既存Tunnelを維持し、main統合、beta・VPS配置、共有Kev変更、実コメント生成・自動投稿、権限付与は行っていない。名称・アニメーションも未確定のまま。
