# 公開プロフィールと公式AI活動基盤（Issue #39）

2026-10-25。最新main `9efbd43` から独立した `codex/issue39-official-ai-accounts` で実装。人間の認証とAIの身元は別物とし、公開プロフィールと公開活動への小さな入口を共有する。

## 正本と責務

- Better Authの `user/account/session` は人間の認証・権限の正本。既存の会員・コミュニティ・運営認可を維持する。
- `ai_identity` はAIの安定ID・論理キー・運営者・active/suspendedだけを保持する。人間Userを作らず、session、コミュニティ参加権、投稿権を発行しない。停止・再開は監査付きの専用CLI。
- `public_profile` は人間UserまたはAIIdentityの一方だけを参照する。人間は本人が明示保存するまで未登録。認証名・Google画像・メール・内部User UUIDをコピーしない。
- AI育成基盤は探索・推論・評価・追加学習・実行記録・成長記録を持つ。今回の基盤はrun/artifactの正本を変更・複製しない。AI育成側に第二のIdentity管理を作らない。

| 公開ID | 安定AI ID／既存binding | 共通表示元 |
|---|---|---|
| `plunode-official-ai` | `501350be-a89f-4bde-9a06-d94631b47be5`／論理キー `plunode-official-ai` | `public/ai/official-profile.png`、`official-small.png` |
| `explorer-apprentice` | `fe93a431-85cf-4fae-8b84-127e8bf866a7` | 既存 `public/ai-lab/apprentice-profile.png` |

公式AI画像は実験branchの固定commit `af31afd5523655da45d2ceab87e0bca37cecd7dc` から必要な2画像のbytesだけを導入。比較ページ・DEMO・開発操作は導入しない。元ファイルは `prototypes/official-ai-character/assets/v02-translucent.png`（SHA256 `372ada0a80883ef472e5cc596d5200cd6e8d2406b7f4b6eeebf1f5b40263f48e`）、`v02-soft-flat.png`（`17799c136ed34477335c581c8640bd26e263461ae8c994a4246518f8e94203c1`）。既存branch・worktreeには書き込まない。公開artifactの旧binding `aiIdentityId:null` は当時の不変記録なので書き換えず、論理キーで新レジストリへ接続する。

## 公開IDと人間の選択

公開URLは `/people/<handle>` と `/en/people/<handle>`。3〜30文字の英小文字・数字・ハイフン、先頭は英字。大文字は小文字へ正規化、連続・末尾ハイフンは禁止。運営・公式・システムの名前空間を予約する。DBのunique制約とtransactionで競合を拒否し、変更前・退会後のIDはclaimの墓標として予約を保持する。旧URLを別人へ再割当・自動転送しない。

編集は `/member#account-settings` に統合する。公開表示名・自己紹介・同梱の4種アイコン・タイムライン公開の1設定。新ストレージや外部画像取得を増やさない。更新は期待revision、Origin、実session、期待User、activeを検証し、競合時は入力を残す。既存アカウント名はCapsuleコメント用の設定として説明を分ける。

## 公開活動の投影

本文の複製ストアは作らない。公開API `/api/accounts/profiles/<handle>` は、匿名・本人・別Userのいずれにも同じ公開投影だけを返す。本人の内部履歴は既存の活動・履歴に残す。

人間のタイムラインは、現時点で以下をすべて満たす実コミュニティ投稿だけを問い合わせる。

1. 公開プロフィールが存在し、Userがactive、タイムラインが公開。
2. 元コミュニティがpublicでサイト停止されておらず、スレッドaudienceがpublic。
3. 投稿statusがvisibleで、作者が現在activeの参加者。
4. 投稿時のauthor_generationと現在の参加世代が一致。

投稿のID・版・作成時刻・発行元・現在の公開範囲をsource参照として返す。本文抜粋は最大240文字。限定スレッド・限定コミュニティは、題名・本文・参加者・存在・件数・時刻・URL・cursorに含めない。タイムライン非公開は空配列とnull cursorだけ。全活動の件数・最終時刻を別途返さない。フォロー一覧に活動件数を埋め込まない。

User→Profile→Communityの順で共有lockを取り、停止・privacy変更・元コンテンツ限定化／非表示・参加失効のtransactionと直列化する。ページごとに認可を再実行し、署名cursorは公開ページ境界だけを含む。閲覧中のUIもfocus/visibilityと定期更新で再確認し、遅着した旧応答はabort・世代で排除する。HTTPはno-store、プロフィールとフォロー画面はnoindex・no-referrer。

既存投稿には009で初回参加世代（現在もactiveかつgeneration=1）を確認できる場合だけ世代を付与する。既に再参加した人の旧投稿は当時の世代を確定できないため保守的に投影しない。新規投稿はDB triggerで実参加世代を記録する。既に参加を失った旧投稿は投影しない。共有リンクのCapsuleコメントは一般公開を意味しないためタイムラインに採用しない。公開→限定へ変わった旧スレッドを、コミュニティ再公開や再参加で復活させない。

AIの実推論・教育・観察コメントは現時点で未接続。ラボの非AI比較5件と推論前保留2件を、AI自身の活動として掲載しない。AIタイムラインは0件。将来接続する際の `AiActivityReference` は主体AI ID、種類、run ID、発行元、artifact hash/版、公開範囲を分ける契約であり、書込APIや第二のrunストアではない。実artifact読取時の検証・現公開可否確認は将来adapterの実装条件。

## フォローと既存導線

実人間Userから人間／AIプロフィールへの一方向の購読。最大200、冪等なPUT/DELETE、本人限定の `/following` と `/api/accounts/following`。自己フォロー不可。停止・退会した対象は一覧から除外する。フォロー先の内部User UUID・メール・人数指標は返さない。フォローは閲覧権限・共有grant・コミュニティ参加を一切作らない。通知、DM、おすすめ、ランキングはない。

コミュニティ投稿者は登録済みの公開名・アイコンからプロフィールへ、未登録／停止者は共通表示へ。認証Userの名前とUUIDを一般公開投稿のauthorとして返さない。管理者名簿・運営の明示確認は従来の認可内に保持する。AIラボから2個体の共通プロフィールへ、アカウント設定と共通アカウントナビから編集・フォロー中へ接続する。

## 有効化と運用

`PUBLIC_PROFILES_ENABLED=1` と明示009 migrationが必要。既定無効、通常起動・アクセスでmigrationしない。000〜008は不変。[適用・backup・復旧手順](../runbooks/PUBLIC_ACCOUNTS_RELEASE.md)を参照。本番VPS・本番会員DBへの適用は今回の作業外。
