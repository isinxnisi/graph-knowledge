# 小畑健→ヒカルの碁：保存資料による再審査

2026-10-20、[Issue #34の依頼](https://github.com/isinxnisi/graph-knowledge/issues/34#issuecomment-6289577954)。**結論は原文照合待ちの保留。作品単位のDRAWINGを再審査する意味上の方向は妥当だが、保存された意味レビューの要約だけで正式受入できる資料は揃っていない。** [JSON記録](../../datasets/connectivity/issue-34-obata-review/review.json)に入力hash、保存原語、既存レコード、保留条件、未承認の通信予算を固定した。

資料元への追加通信は0回。既存保存資料とローカル収集キャッシュを読んだ。GitHubの依頼確認・本結果の報告とGitのpushは作業管理に限る。収集実行、候補受入、正式受入、公開apply、既存KG・UI・Worker変更は行っていない。既存テーマ[#5](https://github.com/isinxnisi/graph-knowledge/issues/5)・[#7](https://github.com/isinxnisi/graph-knowledge/issues/7)を再利用し、別テーマや新Issueを作らない。

## 対象と既存の支持

| 確認対象 | 保存記録から確認した内容 |
| --- | --- |
| 小畑健 | person `d5e39491-5a5f-423c-9222-2eb3c18db9a8`、既存外部ID `Q313703`。r0003受入票と公開snapshotに存在 |
| ヒカルの碁 | work `0c29d0e2-685f-4c56-9805-6bf1baf40e7c`、既存外部ID `Q582763`。原作r0002受入票と公開snapshotに存在 |
| 媒体・対象 | r0002の既存同定、保存Wikidata snapshotのP31 `Q21198342`、NDL「ヒカルの碁. 1」と漫画のジャンルを照合。同名アニメのUUIDを追加・統合しない |
| 今回の人物→作品組 | 固定公開fixtureではClaim **0件**。小畑の作画は未受入候補のまま |
| 再利用の限界 | 既存UUID/QIDの確認であり、新しい同一性の認定ではない。追加原文の小畑・対象漫画との対応が曖昧なら保留 |

既存の[受入票（小畑）](../../datasets/manga-collection/accepted-r0003-20261017/acceptance.json)と[受入票（作品）](../../datasets/manga-collection/accepted-original-story-r0002-20261017/acceptance.json)を照合した。古いr0002レビューの`formalAcceptance: pending`を現在の既存Entityの未受入と読み替えない。一方、Entityの受入済み状態は未公開の制作関係を承認しない。

公開状態の参照は保存済みrelease `manga-issue-25-utc-recovery-08-normal`、revision `88437056-b74f-42ab-88c0-33ed435bdccc`。Workerの旧ローカルbase `20261014-credits-001`／revision `82b01515-594c-48ca-b4b6-515eefac83ca`とは区別する。現在のサーバーを再照会した結果ではない。

## 資料ごとの再評価

| 資料 | 保存されている根拠 | 作画の支持と限界 |
| --- | --- | --- |
| [NDL第1巻の保存書誌](../../datasets/manga-collection/original-story-r0002-20261017/ndl-9784088727172.json) | `小畑健 漫画`（ja）。日本語第1巻、集英社、ISBN13 `9784088727172`。元XMLもローカルキャッシュにあり、台帳のhashと一致 | 小畑名と当該刊行物の責任表示を確認できる。**「漫画」をDRAWINGへ変換しない**。原本実見ではない |
| [日本棋院の受賞記録](https://archive.nihonkiin.or.jp/kishihp/umezawa/journal.htm) | [保存意味レビュー](../design/MANGA_PRODUCTION_ROLE_REVIEW.md)の「漫画3件」は、小畑の作画が明示されると要約 | 現行DRAWINGの有力な確認先。ただし対応する原文抜粋・段落locator・取得日時は保存範囲で見つからない。要約を原文として引用しない |
| [集英社の本人インタビュー §8](https://jumpsq.shueisha.co.jp/contents/manganogokui_2nd3/interview8.html) | 同レビューは、ヒカルの碁でネーム原作を受け絵に集中した経緯を要約 | 本人が当該漫画を描いたという明示なら現行DRAWINGの支持候補。原文照合待ち。脚本担当や制作工程全体は推論しない |
| 保存Wikidata `Q582763` | P110に`Q313703`。statement `Q582763$82c297e4-42a4-29ed-4ccb-fc806f38bbae`、referencesは空。元台帳も`candidate-only-no-role-inference` | 候補発見・既存同定の補助。P110だけでDRAWINGを確定しない |
| 集英社の著者表記・別作品資料 | 意味レビュー中のヒカルの碁の「著者」要約、[r0003追加根拠](../../datasets/manga-collection/review-r0003-20261017/additional-evidence.json)のバクマン。著者・インタビュー§4 | 著者と作画は別の支持命題。別作品・別ページをヒカルの碁の作画根拠に使わない |

検索範囲はtracked `docs/`・`datasets/`と`.local/collection-jobs/`・`.local/collection-trials/`。ローカル566ファイルの拡張子を確認し、2 URLの参照と、全220件の`.body`をUTF-8／CP932で照合した。人物・作品名があるキャッシュはNDL等で、日本棋院／§8の本文・必要な作画原文は見つからなかった。この結果は確認した保存範囲に限り、他の保存先や現在のWebの不存在を意味しない。

元r0002台帳・2 QID snapshot・NDLキャッシュのhashを検証した。QID snapshotと台帳の該当部分はJSONへ抜粋し、ローカル限定の元path／hashも記録した。NDLは作成元書誌の責任表示のみ利用し、キャッシュに同梱された所蔵館・第三者データを追加根拠へ混ぜない。

## Role・刊行物scopeの判断案

[現行DRAWING契約](../design/CONTRIBUTION_CREDITS.md)は漫画の「画」「作画」の明示、または本人による当該漫画を描いたという明示を支持対象にする。新Roleは不要。原資料でこの条件と対象の対応を確認できた後、既存2 UUIDを端点とする作品単位のDRAWINGを人間レビューへ出す。

その場合も[scope契約](../design/CONTRIBUTION_ROLE_CONTRACTS.md)に従い、提案は`scope: null`（適用範囲が未構造化）、期間は`from/to: null`。これは全巻・全版・全期間の認定ではない。NDL第1巻に「漫画」があることと、別資料に作品単位の「作画」があることを組み合わせても、**ISBN `9784088727172` のDRAWINGは自動成立しない**。刊行物scopeを付けるなら、その刊行物の作画クレジットを直接支持する別の資料確認が必要で、今回の次段にも要求しない。

既存Claimと根拠はJSONに元の全fieldをそのまま抜粋した。

| 既存Claim UUID | 成立済みの内容 | 保持する根拠 |
| --- | --- | --- |
| `10f72eb0-3526-4d50-a552-e2239c01fc39` | ほったゆみ→ヒカルの碁、ORIGINAL_STORY、第1巻 ISBN `9784088727172` | Source `751742b2-a8c7-40fe-96c1-8e91a116f789`、Citation `13adf6b0-da63-4be0-abd7-b8aeb54d6bdf`、原語`ほったゆみ 原作` |
| `cd294bb9-a7de-4f21-95c2-84b878c0e7cc` | 小畑健→バクマン。、AUTHORSHIP、第1巻 ISBN `9784086196901` | Source `6dfb8c00-412a-4bd6-88f8-58f85b98247e`、Citation `c2a11bab-9544-49af-a352-668f7cb08aff`、原語`著者：小畑 健` |

ほったのCitationを小畑へ付け替えず、バクマン。のAUTHORSHIPを作画へ置換しない。今回の候補には新規Claim・Source・Citation UUID、原文の代用品、受入票を作らない。

## 次の承認対象

まず承認を求める対象は、**不足原文の確認通信のみ**。推奨予算は次の固定HTML最大2件、各1 GET、再試行0回。今回は未実行・未承認である。

| 順序 | 取得対象 | 確認内容・条件 |
| --- | --- | --- |
| 1 | `https://archive.nihonkiin.or.jp/kishihp/umezawa/journal.htm` | 小畑健・漫画ヒカルの碁・作画が同じ文脈で明示されるか。十分ならここで終了 |
| 2（条件付き） | `https://jumpsq.shueisha.co.jp/contents/manganogokui_2nd3/interview8.html` | 1件目の内容だけでは不足する場合に限り、本人の当該漫画を描いたという明示と分担の範囲を確認 |

逐次実行・間隔3秒以上・1試行20秒以内・1レスポンス2 MiB以内、合計4 MiB以内。リダイレクトは追わず、認証・403・429・サイズ超過・対象不明もその時点で停止して報告する。失敗を理由に2件目や別URLへ自動迂回しない。検索、画像、周辺ページ、NDL／Wikidata再取得は含めない。保存は資料名・提供元・必要な短い原文・言語・見出し／段落locator・取得日時・レスポンスhash・支持範囲に限る。

原文確認が完了した後の人間判断は、①既存人物と対象漫画への対応、②作品単位DRAWINGの支持可否、③`scope: null`と期間不明の限定、④資料ごとのCitationの支持範囲。いずれかが未確定なら保留する。これは将来の意味レビュー対象で、正式受入の実行・receipt／release生成・Worker登録・公開applyは別の指示を要する。DEATH NOTEは今回必須とせず、ONE・村田雄介へ移らない。

## 検証と環境

保存NDLの原語・ISBN、元snapshot／台帳hash、公開fixture内の対象組0件、既存UUIDと全fieldの一致、入力12 artifactのhash、候補の未受入状態と通信予算、Markdownリンク、`git diff --check`を検証した。CLI・製品コードの追加や変更はない。

#33と別branchの独立worktreeで固定入力を読み、main反映時だけ共通holdを取得して固定SHAを統合する。文書／分析記録だけなので3200・beta・VPSを再build・再配置しない。これらの実行環境への今回の変更反映は不要で、新しい稼働確認も行っていない。保存済み公開観測とWorker旧baseの差は維持した。
