# AI育成ラボのCloudflare接続

2026-10-22。ユーザーの明示指示で、既設の `graph-ailab.isinxnisi.com` に隔離確認版を接続した。設定値の確認を依頼した後、下記のポート切り分けで解決し、ユーザー自身も閲覧できたことを確認した。

- ラボ：<https://graph-ailab.isinxnisi.com/ai-lab>
- キャラクター比較：<https://graph-ailab.isinxnisi.com/ai-character-study>
- Home：<https://graph-ailab.isinxnisi.com/>

本体は `127.0.0.1:3268`。指定ドメインを完全一致のHost許可へ追加した。旧3286を止めると外部404が502になり、3286→3268のloopback中継を置くと200になった。この実測に基づき、旧ローカルURLと既設トンネルを維持する3286互換中継を起動wrapperへ組み込んだ。Cloudflare側はHTTP・localhost:3268へ合わせられる。どちらのポートでも同じアプリを配信する。

起動前に両ポートの空きを確認し、他プロセスを置換しない。停止時は本体と中継を同時に終了する。直前に終了した接続のTIME_WAITを使用中listenerと誤認しないよう、空き検査にSO_REUSEADDRを使用した。既存listenerを起動し直そうとすると拒否され、稼働PID記録が変わらないことを確認した。

検証結果：

- Next.js production build・TypeScript成功。
- ローカル3268で日英×1440/390pxのラボ往復4条件、API境界検証が成功。
- HTTPSでも同じ4条件が成功。Home・Graph・Claim・アカウントへの復帰、Graph配置／zoom／pan、ラボの履歴と保留表示を維持。
- 3268・3286・HTTPSの3経路でHome／ラボ／比較／公開datasetが200。no-store・noindex・CSPを確認し、候補PNGのhashが一致。
- 非公開ファイル・推論／学習／書き込みパス404、未接続会員/auth API503。両ローカルポートで偽装HostとX-Forwarded-Hostを拒否。
- betaとgraph-comのHome／datasetが200のまま。
- ユーザーのChromeでもHTTPSの比較画面を表示し、確認用タブを残した。

再検証は `node prototypes/ai-lab/environment.test.mjs`、ブラウザ往復は `AI_LAB_ORIGIN=https://graph-ailab.isinxnisi.com` を付けた既存の `navigation.test.mjs` で実行する。

Cloudflare管理画面は未ログインだったため設定を書き換えていない。DNS・Access・トンネルサービスの再起動、main統合、beta／コミュニティ／VPS配置、会員・共有Kev・AI実行記録の変更は行っていない。ホストPC・WSLと確認サーバーが稼働している間の確認用配信であり、再起動時の自動起動追加や正式配信基盤の受入は含まない。
