# Phase 12：優先候補の実資料確認・意味比較

2026-10-05。設計・資料確認のフェーズ。現役の[第1回比較レビュー](../../design/RELATION_MODEL_COMPARISON_REVIEW.md)、[研究台帳v1](../../research/phase-12-relation-model/v1/README.md)を参照。未確定の人間受入・語彙境界はdesign／台帳に残す。

## 完了した範囲

- NBIのVisitor対照とAssociate professor候補、キュリー家parent2＋spouse2、映画派生2を本文で確認。
- 新規7候補は根拠確認済み・humanAcceptance=pending。既存Visitorの広い受入を型付き限定の受入へ移さない。
- 7 Sourceと13候補参照。8記録×5方式、各11項目の40比較票。既存22 Claimの凍結情報も照合。
- BFIの同じ作品ペアへのadaptation/remakeの用語併用、映画の旧公開題による同名同一性リスク、Nobel略歴の再刊版、婚姻日とSource日の違いを記録。
- siblingの直接資料は未確保。科学C09のpending、派生方式正規化の留保を維持。

## 実行した確認

公開URLをweb.openで確認し、Nobel／PDF等は通常のHTTP GETも実施。取得本文は/tmpへだけ置いた。PDF抽出のpypdf／typing_extensionsも/tmpの作業用環境へ展開し、依存ファイルを変更していない。Sourceに通常GETのhash・UTC・版・言語・locatorを残す。直接403でもweb本文を確認できた省記事はhash未取得として明示。

台帳の参照・比較項目・件数・manifest、凍結入力のSHA-256、Git開始版との差、文書リンク、語彙チェックを確認する。再現用の台帳検証コマンドは研究台帳READMEに収録。検証結果は下表へ記録する。

| 検証 | 結果 |
| --- | --- |
| 台帳JSON・参照・比較充足 | 8記録／新規pending7／40比較票／13参照／10 Entity参照／7 Source、全て成功 |
| 取得Sourceの照合 | HTTP本文hash6件と原文断片8箇所一致。S04はweb本文確認・HTTP本文hashなしと明示 |
| 既存fixture／dataset／語彙JSONの不変 | 全34ファイルがmanifestおよび開始commit 27cb3b0のSHA-256と一致 |
| vocabulary:check --base-ref 27cb3b0 | 4 predicate／4 Role、0 error。既存の同一端点警告1件のみ |
| npm test | 7ファイル／158テスト全成功。既存テストを実行、新規runtimeテストは追加なし |
| 文書リンク / git diff --check | 変更文書のローカル51リンク、空白差分検証とも成功 |

実行コマンドは研究台帳READMEのpython3検証、npm run vocabulary:check -- --base-ref 27cb3b0、npm test、git diff --check。別の一時python3スクリプトで取得本文・PDF断片、git show 27cb3b0の凍結入力、Markdown参照も照合した。

DB・API・UI・schema・predicate／Role catalog・fixture・pilotを変更していない。seed・既存dataset生成・DBコマンドを実行せず、実ブラウザ観察も行っていない。typecheck／build／integration／Playwrightはコード変更のないこのフェーズでは再実行しない。意味方式を実UIへ通して評価した結果とは扱わない。

## 残す判断

構造化された組織立場、配偶者の対称保存、派生方式の同義／包含、限定なしと取得無条件、肯否・period・scope・比較キーの意味契約を決めてから実装する。今回はすべての新関係を同一Roleへ一般化する方針を採用せず、独立命題／限定の責務を比較した。次の人間受入・D/E/C収集を承認済み実装として先取りしない。
