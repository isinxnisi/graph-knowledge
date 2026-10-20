# 小畑健→ヒカルの碁：単回GETによる作画原文の確認

2026-10-20。[Issue #34の追加取得許可](https://github.com/isinxnisi/graph-knowledge/issues/34#issuecomment-6291894753)に従い、PCのcurlから指定日本棋院URLへHTTPS GETを**1回だけ**実行し、HTTP 200で成功した。**原文の「作画」が確認できたため、作品単位DRAWINGの正式受入を人間が判断できる候補として推奨する。正式受入は未実行で、人間判断待ち。**

[前回の保存資料レビュー](OBATA_HIKARU_REVIEW_20261020.md)で不足していた生HTTP証跡・原語・locatorを今回補った。[JSON記録](../../datasets/connectivity/issue-34-obata-evidence/review.json)に取得情報、元body hash、入力hash、既存レコード、支持範囲とレビュー案を保存した。以前のチャット側のDNS失敗や閲覧表示を今回の証跡へ流用していない。

## 取得証跡

| 項目 | 結果 |
| --- | --- |
| 許可対象・実際のURL | `https://archive.nihonkiin.or.jp/kishihp/umezawa/journal.htm` |
| 実行環境・クライアント | Windows PC、curl 8.21.0／libcurl 8.21.0／Schannel |
| HTTP／curl | **200 OK／exit 0**、GET、接続1回、redirect 0、実効URLは指定URLと同一 |
| 取得開始 UTC | `2026-10-20T13:26:59.873Z` |
| 取得完了 UTC | `2026-10-20T13:27:00.414Z`（PC時計） |
| 所要時間・元body | `0.421864`秒、**1,487 byte**。Content-Length・curl受信量・保存byte数が一致 |
| 元HTML body SHA-256 | `86cfb31314e9e3fe2bf26e04425580c2dc3d5660cbd3b522e32e8be1d533af1b` |
| 生HTTPヘッダ SHA-256 | `4ce27246808ca6df03e8570906e541cf84999a08511095d899af5c997050ad57` |
| Content-Type・文字コード | HTTP `text/html`、HTML META `Shift_JIS`。元byteをstrict `shift_jis`で復号、置換文字なし |
| ページ情報 | TITLE「ジャーナリスト賞」、見出し「ジャーナリストクラブ賞受賞」、表示日「2001年12月13日」 |

`curl -q`で設定ファイルを無効化し、GET／HTTPSのみ・redirect追従なし・retry 0・max-time 20秒・max-filesize 2 MiBを明示した。`Accept-Encoding: identity`で取得し、文字・改行変換や再圧縮を加えていないbodyをhashした。ヘッダのDateは`Tue, 20 Oct 2026 13:27:04 GMT`で、PCの取得時刻とは別に記録した。ページ表示日・Last-Modifiedを制作期間へ転用しない。

元HTML・生ヘッダ・取得manifest・curl転送記録は、Git管理外の`.local/collection-trials/issue-34-nihonkiin-pc-20261020/`へ保管する。main反映時に同じ元byteを運用領域へ複写し、directory 0700／files 0600で管理する。公開するのはhash・必要な短い引用・locator・レビューで、HTML全体や画像はコミットしない。

## 原語とlocator

短い文脈引用：**「ヒカルの碁」の原作者ほったゆみ氏、作画の小畑健氏**。

Roleの原語は**作画の小畑健氏**（ja）。「漫画」を言い換えたものではなく、日本棋院本文に直接現れる。同じ文が作品名と原作者・作画・監修を区別している。

| locator | 固定位置 |
| --- | --- |
| 文脈 | 「ジャーナリストクラブ賞受賞」下の受賞説明。クラブと囲碁ブームの説明に続く、原作者・作画・監修を列挙する文 |
| 元HTML行 | **25行**（LFを数える1始まり。元CRLFは保持） |
| ソース上の要素 | `html > body > center > table > tbody > tr:nth-of-type(2) > td:nth-of-type(2)` |
| 元body内の引用範囲 | **byte [1024, 1074)**、0始まり・終端を含まない。Shift_JISの50 byteが上記引用と一致 |

HTML内に媒体語「漫画」そのものはない。対象UUIDとの対応は、作品名だけで決めず、保存NDLの「ヒカルの碁. 1」「ほったゆみ 原作」「小畑健 漫画」、既存の漫画同定・ほったの公開済み原作Claimと照合した。この組合せで既存漫画への対応を支持すると推奨し、最後の同一性確認は人間へ戻す。今回の原文から受賞関係や監修者の同一性を追加認定しない。

## 人間に提示する受入対象

| 判断対象 | レビュー案 |
| --- | --- |
| subject | 小畑健 person `d5e39491-5a5f-423c-9222-2eb3c18db9a8`。既存外部ID `Q313703`を保持 |
| object | ヒカルの碁 work `0c29d0e2-685f-4c56-9805-6bf1baf40e7c`。既存外部ID `Q582763`、既存の漫画Entityを参照 |
| 意味 | `CONTRIBUTED_TO`、肯定、**DRAWING**。現行契約の作画明示を支持する資料として推奨 |
| scope | **null**。作品単位の資料による支持で、適用範囲は未構造化。全巻・全版を意味しない |
| period | **from/toともnull**。ページ日付や受賞日から制作期間を補わない |
| Citation案 | 日本棋院の上記URL、取得日2026-10-20、support、roleEvidence `作画の小畑健氏`／ja。上記locatorと短い文脈を保持 |
| 状態 | **直接支持確認済み・正式受入の人間判断待ち**。Claim／Source／Citationの新規UUIDは未確定、受入票なし |

[DRAWINGの現行意味](../design/CONTRIBUTION_CREDITS.md)と[scope契約](../design/CONTRIBUTION_ROLE_CONTRACTS.md)は変更しない。NDLの「漫画」は元の表記のまま残す。日本棋院資料はISBN `9784088727172`、特定巻・版・言語版のクレジットを示さないため、刊行物scopeを移植しない。脚本・ネーム・権利・全期間の担当も認定しない。

既存のほったゆみ→ヒカルの碁 Claim `10f72eb0-3526-4d50-a552-e2239c01fc39`（ORIGINAL_STORY／第1巻scope）と、小畑健→バクマン。 Claim `cd294bb9-a7de-4f21-95c2-84b878c0e7cc`（AUTHORSHIP／別ISBN scope）は、関連Source・Citationを含む全fieldが固定公開fixtureと一致することを再確認した。既存Citationの付替えや既存Claimの再受入は行わない。

人間が決めるのは、この資料と保存NDL等が既存の人物・漫画UUIDに対応すること、上記の限定付きDRAWINGを受入対象にするか、資料別Citation案の支持範囲が適切かの3点。対応が曖昧、または特定ISBN等の追加限定が必要なら保留する。根拠を揃えたことは正式受入の実行許可ではなく、その実行には別の明示指示が必要。

## 検証と実行境界

オフラインで6入力artifactとGit外4ファイルのhash、HTTP status／URL同一・redirect 0／受信量、strict復号、元byteの引用範囲・行・要素locator、既存UUID・Role・scope・Source／Citationの全field、未受入状態、Markdownの相対リンク、`git diff --check`を照合した。製品コードや収集CLIの変更はない。

許可された1回は成功で消費済み。再試行・集英社URL・別URL・画像・周辺ページ取得は0回で、残る取得許可はない。正式受入、receipt／release、Worker登録、公開apply、VPS・会員DB・検索UI変更は未実行。#5/#7を再利用し、#33とは独立worktreeで資料を作成、main反映だけを共通hold内で直列化する。文書／レビューのみなので3200・beta・VPSの再build・再配置や新しい稼働確認は行わない。
