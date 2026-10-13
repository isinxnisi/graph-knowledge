# 退会・利用停止と最小運営操作

2026-10-13、公開β工程14の採用契約。認証・会員保存は[会員Capsule](MEMBER_CAPSULES.md)、本番接続は[Google接続準備](GOOGLE_MEMBER_CONNECTION.md)を併読する。実Googleの接続完了を意味しない。

## 本人の退会

`/member` の「退会・アカウント削除」から範囲を確認し、同意後に明示送信する。未保存のCapsule編集・表示名編集がある間は開始できない。画面を開くだけ・取り消しでは何も変更しない。

`DELETE /api/member/profile` はJSON `{ "confirmation": "delete-account" }`、同origin、現在のDB session、`X-Member-User` の一致を要求する。認証情報の作成から30分を超えたsessionでは `403 RECENT_LOGIN_REQUIRED`。単なるsession更新時刻を直近の本人確認にしない。別タブでログアウト／ログインし直してから再確認できる。

一つのPG transactionで次を物理削除する。

- User・provider account・全端末のsession。
- 本人所有の**全dataset**のCapsule、共有済みsnapshot・リンク・会話・冪等性receipt。Capsule内の他人の投稿も削除する。
- 他人のCapsuleにある本人の投稿。投稿先のCapsule・他人の投稿は保持する。

Neo4jのEntity／Claim／Citation／Source、ブラウザ内保存、Googleアカウント自体は変更しない。受信者のコピー・画面記録や既存バックアップを回収したとは表示しない。運営操作記録は会員の保存内容と区別して残す。これらの対象外を確認画面へ明記する。

成功は `{ "deleted": true }`、private/no-store。応答消失やDB障害では完了扱いにせず再確認を案内する。以前のsessionで再送しても新規保存を作らず401になる。再登録では新しいUser UUIDになり、削除済み内容へ結合しない。削除後の古いcookieはDB sessionがないため利用できない。

## 運営操作

汎用管理画面・HTTP管理API・Userの自己申告admin権限は追加しない。対象環境の会員DBへ接続できる運営者が、専用CLIを明示実行する。一般Userへこの接続権限を渡さない。`actor` は操作した運営者の識別名であり、DB権限を付与する入力ではない。

| 操作 | 効果 |
| --- | --- |
| `suspend-user USER_UUID` | active=false、全session・本人の有効共有リンクを削除、本人の会話受付を閉じる。private内容は保持。他所の投稿は読取時に本文・名前を非表示にする |
| `resume-user USER_UUID` | active=true。新たなログインを許可。旧session・旧リンク・会話受付は復活しない |
| `block-sharing CAPSULE_UUID` | 現リンクを失効し、Capsuleの共有を継続停止。再発行・会話受付再開を拒否。本人のprivate保存・版の閲覧・編集は維持 |
| `hide-post POST_UUID` | 指定投稿の本文・作者名を会話／本人投稿一覧へ返さない。本人撤回とは区別。本文はPGに保持し、本人による撤回・退会時には削除可能 |

利用再開後は、本人撤回・運営非表示の対象ではない既存投稿を再び読める。旧session・旧共有リンク・会話受付は復活させない。

共有停止・投稿非表示の解除UI／CLIは今回追加しない。誤操作の修正に必要な場合は対象と影響を確認して別途対応する。停止Userの再開は上記の明示操作に限定する。運営非表示をKG Claimの否定・評価へ変換しない。

### 実行方法

Git外の対象環境設定を読み込んだshell、または本番 `member-ops` containerで実行する。credentialをコマンド引数・履歴・出力へ載せない。

```bash
# 既定はdry-run。対象の存在を確認するが、状態・監査記録は変更しない。
npm run member:ops -- suspend-user USER_UUID \
  --origin https://graph.isinxnisi.net --actor OPERATOR --reason security

# 適用には同じ対象UUIDの再指定が必要。
npm run member:ops -- suspend-user USER_UUID \
  --origin https://graph.isinxnisi.net --actor OPERATOR --reason security \
  --apply --confirm USER_UUID

# 本番operator imageはmigrationと同じ会員設定境界を使う。
docker compose --env-file PRIVATE_ENV -f compose.production.yaml run --rm \
  member-ops scripts/member-ops.ts block-sharing CAPSULE_UUID \
  --origin https://graph.isinxnisi.net --actor OPERATOR --reason abuse \
  --apply --confirm CAPSULE_UUID
```

`--origin` は接続設定と完全一致させる。理由は `abuse / security / request / correction`、操作も上記四つの閉じた集合。任意SQL・本文・メール・自由理由は受け取らない。成功出力は操作・対象UUID・適用有無・状態差だけ。失敗出力にもDB接続情報や投稿本文を出さない。

追加migration `004-account-operations.sql` を先に適用する。既存000〜003を変更しない。`member_operation` には運営状態が変わった時だけ操作・対象UUID・運営者名・定型理由・時刻を残し、メール／token／内容の複製を置かない。本人退会も削除UUID・`self`・`request`・時刻だけの受理記録を同じtransactionへ残す。退会記録の作成をCLIには公開しない。対象を退会で消しても監査行は参照切れとして残せる。現段階は運営限定のβ準備記録であり、保持期限・問い合わせ窓口・バックアップからの削除反映は公開前の運用／表示確認（工程19・22〜24）で確定する。無期限保持の製品仕様にはしない。会員DBの古いbackupへ復元する時は、現在の退会／停止記録を保全して再適用する必要があり、古いbackupだけで削除したアカウントを復活させない手順を工程19へ残す。

## 競合・既存機能との境界

退会／停止はUser行、退会は本人の投稿先を含むCapsule行をUUID順、共有停止はCapsule行、投稿非表示は既存のUser→Capsule→投稿の順でlockする。保存・版更新・削除・共有発行・撤回・投稿は同じactive確認／Capsule lockを使い、停止直前に認証済みの要求が後から書き戻すことを防ぐ。session作成もDB triggerでactiveを再確認する。全操作はtransaction失敗時にrollbackする。

共有停止状態は所有者の共有statusへ `blocked` として返し、再発行ボタンを無効化する。非表示投稿は既存の `body=null / withdrawnAt=null` で表現し、作者撤回と混同しない。本人は本文を取得できなくても撤回できる。無効化後の既に表示済みの共有内容は、既存の再確認・タブ復帰・30秒確認で閉じる。ブラウザへ送信済みの内容を瞬時に回収できる契約ではない。

KG・意味モデル・dataset・Graph state・依存packageは変更しない。一般公開／実Googleは工程13・22の別確認。日常3200/Tunnelは検証済みcodeへ更新するが、会員設定なしの状態は維持する。
