# コミュニティ：実betaへの有効化

2026-10-23。ユーザー承認により `4cbf875` のC1a／C1b／C3-minを3200／graph-betaへ有効化。本番公開の承認・記録ではない。

## 適用先と既存データの保護

- Web: `https://graph-beta.isinxnisi.com/communities` → 既存Tunnel → ローカル3200。
- 認証: 既存Better Auth／Google。originはbeta、cookie prefixは `gk-member-beta`。fixture認証は有効化しない。
- DB: ローカル `127.0.0.1:55433/graph_member`、非superuser `gk_member`。
- container: `graph-knowledge-member-beta-postgres-1`、volume: `graph-knowledge-member-beta_member-data`。`compose.member-beta.yaml` と実containerのport／mountを照合。本番VPSの `graph-member-postgres:5432` とは別。
- 変更前の会員2件・個人Capsule2件を保持。既存000〜004のchecksumを検証し、005〜007をtransactionで適用。適用後も既存件数は2／2。
- private `.env.public`（0600）に `COMMUNITY_ENABLED=1` を保存し、既存起動方法で再起動。秘密やDB接続パスワードはGitへ含めない。

## バックアップと復元確認

バックアップ: `/home/isinxnisi/.local/share/plunode-backups/community-beta-20261023/before-005-007.dump`（29527 bytes、0600、親0700）。SHA256: `71cf3a4770cd51ed41a3d3a7891e84f6e49096762c507102ebb9b7a659c8a3bb`。

`pg_dump -Fc` 後、`pg_restore --list` に加え、同containerの新規一時DB `graph_member_restore_c3_20261023` へ実restore。000〜004・会員2件・Capsule2件を確認した後、この一時DBだけを削除。稼働DBをrestoreで上書きしていない。

## 発見した不具合と修正

コミュニティが共通ヘッダーへ `page="member"` を渡していたため、ログイン／自分のCapsule／設定／投稿のリンクがコミュニティ内の存在しないアンカーを指していた。専用page種別を追加し、既存の本人情報供給を再利用しながら `/member` の正しい位置へ遷移させる。共通ヘッダーの回帰テスト14件成功（新規1件を含む）。

空の一覧では `margin:auto` が縦方向の余白を均等に配分し、見出しが画面中央へ下がっていた。mainを残りの高さへ伸ばし、水平中央配置だけを維持するよう修正。PC・スマホの情報開始位置をヘッダー直下に揃える。

## 実環境の検証状況

最終build `6P2ZUgXOBrtoUJ8lb8_rG` を3200へ反映。型検査込みbuild・関連ESLint成功。修正後の実Chromeで、日英・390／1440幅、ヘッダーからアカウントへの移動とブラウザ戻る、一覧の開始位置を確認。

3200の匿名APIで一覧200、参加先・招待・参加履歴・通報履歴・profileは401。匿名書込は401、別Origin書込は403。通常のChromeから外部HTTPSのコミュニティ画面と一覧APIの読込、日英切替、390／1440幅を確認。Python標準HTTPクライアントでは外部HTTPSが403になったが、実Chromeでは正常表示した。保護設定は解除していない。

既存Google OAuthの開始からGoogleのアカウント選択画面まで到達。複数の本人アカウントから使用するものを運営者へ選択依頼中で、callback後の本人session・実betaでの作成／招待／投稿／非表示／権限失効検証はまだ完了していない。確認用コミュニティとスレッドも本人ログイン後に作成する。既存Userへのなりすましsessionや認証迂回を作らない。前工程の隔離DB検証を、実beta操作完了として扱わない。

## 切り戻し

1. 最初に手動作業ロックを取得。private `.env.public` の `COMMUNITY_ENABLED=0` に変更し、3200の実行PIDとcommandを確認してそのWebだけを再起動する。DBはそのまま保持する。通常はこの機能停止だけでよい。
2. コードも戻す必要があれば、今回のWeb更新前build `backups/community-beta-enabled-prebuild-20261023` を、3200停止後に復元する。現buildも別名退避し、既存の起動方法で再起動。
3. DB復旧が必要なら、まず新しいbackupを採取し、新規の復旧用DBへ上記dumpをrestoreして確認する。評価開始後の投稿を失うため、稼働DBの上書きや旧時点への切替は別途判断する。005〜007を逆SQLで強制削除しない。

## 運営者の実機確認手順

iPhone SafariでbetaへGoogleログインし、コミュニティ→作成→公開スレッド→投稿→アカウント→戻るを確認する。別アカウントの招待用IDを招待画面で共有し、限定コミュニティへ招待→本人承諾→限定スレッドを確認。退出・再参加後に以前の限定会話が見えないこと、通報・非表示後の再読込、バックグラウンド復帰、スクロール、日英切替を確認する。iPhone実機はCodex側で操作していない。

本番、公開KG、Worker、Kev、graph-com試作は変更しない。C2／AIは未実装のまま。コミュニティCapsuleは準備中、既存の個人Capsuleは継続利用可能。
