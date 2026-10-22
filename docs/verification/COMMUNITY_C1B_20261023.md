# コミュニティC1b 隔離検証（2026-10-23）

基準：main `214b5c4`（C1a `1855e84`、UI `abb26f5`を含む）。[採用契約と運営手順](../design/COMMUNITY_CONTINUITY.md)。公開・既存会員DBへの適用とは別の実装検証。

## 実装した操作

- アカウントUUID宛て招待、本人承諾／辞退、期限、取消、再発行。宛先本人のアプリ内一覧で確認する。メール検索・配送は対象外。
- 自主退出と除外を分離。除外／参加停止からの招待は明示的な再受入を必要とする。新世代で参加し、過去の限定audienceは復活しない。
- 管理者依頼取消、降格、辞任。最終管理者の離脱はアーカイブ。管理者不在の申請・本人取消・運営approve/reject・本人就任承諾。申請／承認だけでは権限を付与しない。
- コミュニティ・名簿・スレッド・投稿・自分の投稿・招待・参加履歴・復帰申請の署名cursor。認可後のLIMIT、同時刻のUUID順、上端時刻、期限と用途・User束縛。場所内のpolicy変更は409で再取得を求める。
- C1画面に招待・参加履歴・復帰状況、管理操作、前後ページを接続。スマホのナビは短い名前の横一列、場所内タブは既存の下線表現。スクロールで履歴snapshotを更新しない。非表示／認証変更は内容破棄、遅着排除。送信中は定期読取による中断を避ける。

## 検証環境

`node --import tsx scripts/test-member.ts --community` は専用の一時PostgreSQLと署名OIDC fixtureを起動し、Better Authの実sessionとDBで試験する。`--e2e`は3221の隔離Next UIを使用。fixture providerはproduction、別origin、別DBで起動できない。終了時に専用DBを破棄する。実GoogleやiPhone実機とは区別する。

既存会員suiteは別の新規DBへ旧migrationのみ適用し、既存Capsule・限定共有・コメント・停止・退会を確認する。005／006がない環境での後方互換も対象。

## 重点確認

実PGの正常系、宛先違い、期限切れ、取消・再発行、承諾競合、発行者の降格、未参加の宛先停止／再開、招待発行と停止の競合、過去cohortの非復活、管理者不在の申請・dry-run・判断監査・本人承諾、期限・失効、LIMIT前の非公開除外、cursorの改変／User違い／policy変更、時刻のmicrosecondsとページ重複・欠落を検証する。

UIはJA 1440px／EN 390pxでC1a回帰とC1b操作を確認。作成→投稿→管理→戻り、招待→参加→除外→再受入、ページ→Back、管理者辞任→復帰申請を実認証で操作する。iPhone実機操作は未実施。

初回E2Eではタブの履歴が増えたことで旧Back試験が失敗し、タブ切替をreplaceへ修正。開発中のFast Refreshと送信中の読取競合も切り分けた。型検査とNext devの型ファイル生成を同時に行うと生成物が消える競合があったため、最終型検査はdev終了後に行う。失敗した実行を成功件数へ重複計上しない。

## 境界とC2への引継ぎ

本番・既存会員DB・KG・収集Worker・Kev・会員Capsule・共有token・版別コメント・Graph保存形式は変更しない。通常の3200／betaではコミュニティflagを無効にする。3275／graph-comは架空データの接続確認版を継続する。

C2は固定版の公開・掲載・閲覧grantと実Graph往復をこのmembership世代・認可へ接続する。新参加・復帰で旧掲載のprivate版を自動共有しない。通報・非表示・コミュニティ停止の運用はC3-minで公開前に必要。名簿の細かな公開設定、メール配送、運営caseのWeb審査画面は後続。運営復帰は当面CLIの明示判断を使う。


## 最終テスト結果

- C1a＋C1b実PG・実認証 **25件成功**（21.26秒、DB起動別）。停止済み元管理者の再受入付き復帰、現参加者の既存audience保持、同時の就任承諾、累計200件を超えるページングも確認。
- 既存会員 **33件成功**（22.09秒、別の新規隔離DB）。旧migrationだけの環境で実施。
- 実画面 **4ケース成功**（JA1440／EN390のC1a・C1b）。追加ナビの最終調整後はC1bの2ケースを再確認し、2.4分／1.6分、合計4.5分で成功。
- 読み上げ名にReact要素を渡したUI調整ミスも重点試験で検出し、文字列のaria-labelと表示用spanへ分離して再確認した。APIの認可を緩める修正はない。

[スマホ招待管理](assets/community-c1b/en-390-invitation-management.png)／[再受入直後](assets/community-c1b/en-390-readmitted.png)／[運営復帰申請](assets/community-c1b/en-390-recovery-request.png)／[PC管理](assets/community-c1b/ja-1440-invitation-management.png)。すべて隔離DBの架空Userで撮影。


追加確認：元管理者が除外・参加停止から戻る復帰は、サイト運営者の `--readmit` とcase監査を必須とし、その後も本人の承諾まで参加権を与えない。アカウント自体の停止中には申請・承認・承諾できない。現参加者の就任は既存の有効なaudienceを保つ。最終API suiteはこれらと200件超の取得を含む25件で成功。


## 環境反映と非対象領域

最終build `sR9FjFCcJwr3cZZZwz1iJ` を3200／graph-betaへ反映。COMMUNITY_ENABLED=0で新UIと新APIは404、Home／PLUTO Graphは正常表示。3275／graph-comは架空データ試作のままHTTP200、既存Host制限も維持。4環境の公開KG読取revisionは `82b01515-594c-48ca-b4b6-515eefac83ca`。

既存member-beta PGへREAD ONLYでmigration名とto_regclassだけを照会し、000〜004のみ、community／community_invitation未作成を確認。User・Capsule本文等は取得せず、DDL・DML・実招待は未実施。本番・Worker・Kev変更なし。

最終API再確認は25件10.25秒、buildはcompile20.1秒・型検査23.7秒＋trace。初回buildはcompile67秒・型検査59秒。開発中の再compileとUI再試験に時間を使ったが、本番の負荷試験を実施したという報告ではない。


追加のJA390／EN1440操作も2件成功（1.7分／1.4分、合計3.4分）。C1bは日英×PC／狭幅の4組を確認済み。既存C1a回帰2件を合わせて6種類の画面ケース。スクロールの過剰History更新は導入していない。

[日本語スマホ招待管理](assets/community-c1b/ja-390-invitation-management.png)／[英語PC管理](assets/community-c1b/en-1440-invitation-management.png)。iPhone実機は未確認。
