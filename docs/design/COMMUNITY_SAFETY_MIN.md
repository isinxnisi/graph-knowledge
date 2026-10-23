# コミュニティC3-min：通報と最小の安全管理

2026-10-23。C1a／C1bを再利用する第1弾の実装契約。知識の真偽、KG受入、人気の評価とは独立する。本番有効化・本番migrationは別承認。

## 初回の操作と権限

| 操作 | 主体・条件 | 作用 |
| --- | --- | --- |
| 投稿／スレッド／場所の通報 | 有効な会員、現在その対象を読める | サイト運営宛てcaseを作成。自動非表示・真偽認定はしない |
| 投稿の非表示・解除 | その会話を現在読めるコミュニティ管理者 | 投稿本文・作者表示を通常応答から除く。古いcohortへの管理者特権は追加しない |
| 本人撤回 | 投稿者本人、退会・アカウント停止前 | 本文を消す。退出後や場所のサイト停止中でも本人管理から撤回できる |
| サイト非表示・解除 | DB運営権限のある担当者、対象投稿の通報ID・case・理由・期待版 | 管理者による非表示と独立。解除しても管理者非表示や本人撤回を復活させない |
| 場所のサイト停止・復帰 | 同上、通報の親コミュニティを明示 | 通常閲覧・書込・参加を閉鎖。復帰はアーカイブ。再開は現在の管理者が明示操作 |
| 通報の終了 | サイト担当者、通報ID・期待版 | resolved／dismissed。投稿の表示状態や真偽は変更しない |

サイト運営は会員のadmin roleではない。既存member-ops／運営復帰CLIと同じOS・DB権限境界を使い、運営APIや試作用role切替は作らない。コミュニティ管理者に通報本文・サイト担当者の非公開横断検索を提供しない。

## 通報と限定確認

`community_report` は対象種別・UUID・通報時revision・内容hash、通報者と参加世代、分類、500字以内の理由、case状態・期限を持つ。元の投稿本文やスレッド全体を複製しない。通報理由には対象外の私的情報を書かない案内を出す。1件の未終了通報を重複作成せず、同一requestIdの再送は同じ受付IDへ戻す。

確認期限は7日。`inspect` は明示実行と監査を必須とし、現在の会員状態・同じ参加世代・元の対象audience・現在内容hashを再確認する。失効・期限切れ・撤回・作者退会による変更では内容を返さない。サイト停止中も、独立した限定case確認として同じ条件を満たす対象だけ確認できる。

- 投稿通報：当該本文だけ。前後の投稿、作者情報、スレッド題名、名簿は返さない。
- スレッド通報：題名だけ。全会話の閲覧権にはしない。
- 場所の通報：場所の題名・紹介だけ。限定スレッドへ展開しない。
- queue：通報／対象UUID・種別・期待版・分類・時刻だけ、50件keyset。私的な題名・本文・理由・通報者IDは含めない。

通報者のアカウント削除では理由を撤回し、reporter FKは匿名化する。自分の通報一覧も受付ID・種別・状態だけを返し、閲覧権喪失後の内容復元に使わない。期限切れを再通報する場合は新しく現在の認可を検査し、元の確認期限を暗黙に延長しない。

## 状態と競合

投稿の `visible / hidden / withdrawn` と、管理者非表示の保持値／サイト非表示を分ける。サイト解除で管理者非表示を上書きしない。withdrawnは解除不能。全変更でpost revisionとcommunity policy revisionを更新し、古いcursor・期待版を拒否する。

サイト停止はarchiveと別状態。停止で未承諾の招待・管理者依頼・運営復帰申請を失効し、復帰しても再発行しない。既存の参加世代は維持するが、その間の会員停止・退出・除外による失効は復活させない。別caseによる直近の停止／非表示を古いcaseで解除できない。

User → Community → Report／Postのlock順を維持。停止と競合する待機投稿・管理操作・確認は取得後に現在状態を検査する。本人撤回も親lockから入り、非表示と同時でも本文を復活させない。通報／確認／対応の監査に主体（会員UUIDまたは運営actor）・理由・対象・case・時刻を残す。本文は監査へ複製しない。

## 濫用制限

PG上の原子的な会員別windowカウンタ。場所を分けた同時要求でも上限を超えない。requestId再送は追加消費しない。失敗transactionは消費を確定しない。

| 操作 | 初期上限 |
| --- | --- |
| 作成 | 5件／時、20件／日、従来の同時管理20件も維持 |
| スレッド | 60件／時。最初の本文も投稿枠を消費 |
| 投稿 | 5件／分 |
| 招待 | 60件／時 |
| 通報 | 10件／時 |

固定時間窓なので境界付近では連続する2窓分が可能。匿名の書込・通報は認めない。信頼しないforwarded IPを会員の代わりに使わない。高度なbot判定は後続。

## APIとUI

- `POST /api/communities/reports`：kind、targetId、expectedRevision、requestId、category、detail。
- `GET /api/communities/reports`：自分の受付状況、既存の署名cursor。
- `POST /api/communities/posts/:id/moderate`：hidden、expectedRevision、reason。
- `GET /api/communities/:id/safety-log`：現管理者かつ現在閲覧可能な会話の管理操作だけ。認可後にLIMIT。通報の理由や存在件数は返さない。

既存の投稿・管理に小さな通報／非表示ボタンと理由フォームを接続。状態表示は「投稿者による撤回」「管理による非表示」を分ける。主な会話・参加操作のデザインは維持する。Capsuleタブは準備中で非活性。個人Capsuleは既存アカウントから利用する。

## 運営CLI（本番実行は未承認）

専用originと安全なenv読込を使う既存の運営端末で実行する。以下のUUID等はplaceholder。stdoutを通常のサーバーログや公開資料へ転送しない。

```sh
node --import tsx scripts/community-safety.ts queue --origin ORIGIN
node --import tsx scripts/community-safety.ts inspect REPORT_UUID --origin ORIGIN --actor OPERATOR --case CASE_ID --reason '確認の目的' --report-revision 1 --revision TARGET_REVISION --apply --confirm REPORT_UUID
node --import tsx scripts/community-safety.ts hide-post REPORT_UUID --origin ORIGIN --actor OPERATOR --case CASE_ID --reason '判断の理由' --report-revision 1 --revision POST_REVISION
# 内容・版を確認後だけ、同じコマンドに --apply --confirm REPORT_UUID を追加
```

`suspend-community / resume-community` の `--revision` はcommunity revision、`hide-post / unhide-post` はpost revision。`resolve / dismiss` は通報期待版を確認する。inspectも既定は内容なしのdry-runで、適用時だけ限定内容を返し監査する。停止を解除するための元caseを解決後も保持するが、解決済みcaseでprivate内容は再閲覧できない。

## 公開前の残る運用確認

- 担当者・通報queueの確認頻度・対応窓口・異議申立先を決め、利用者向けprivacy／通報説明へ反映する。通報は内容の正誤判定でないことを明記する。
- 通報理由・監査の保持期間と削除手順を承認する。7日は本文確認の期限であり、DBレコードの自動消去期限ではない。retention jobは未導入。運営actorに本文を渡す外部AI・外部配送はない。
- 既存会員DBと追加005〜007のbackup、暗号化・権限制限・世代管理・復旧目標、削除／停止履歴の復旧後再適用を確認する。実本番restore・設定変更は別承認。
- migrationを複製DBで練習しchecksumと旧Capsuleの不変を確認。明示migration完了前はflagを有効化しない。rollbackはflagを外して追加tableとデータを保持し、旧appへの戻しを確認する。005／006だけの期間にも停止・退会を破壊しない。
- 実Google認証、iPhone実機、停止中・復帰時のcache／遅着応答、ログの個人情報を最終確認。隔離OIDC／狭幅Chromiumの成功と区別する。

高度な審査Web画面、AI、C2掲載・Graph連携、真偽／KG受入はこの実装に含めない。
