# AdMaxの登録・設置確認・審査・配信

2026-10-15。既存の公開・広告origin分離を維持し、広告配信だけでなく設置確認と審査開始までを扱う。[公開βの適用手順](PUBLIC_BETA_LAUNCH.md)を併読する。

後続の本人報告で広告枠が「配信中」へ変化。以下の審査記録は当時の障害であり、現在も審査待ちという意味ではない。現在の配置と初期設定は次節を正本とする。

## 配置と地域別初期設定（2026-10-15）

- Graphと隣接関係は独立カードとし、同じ中央スクロールに **Graph→広告→隣接関係** の順で置く。図の凡例は「図の見方」へ畳み、広告より上の説明量を減らす。隣接一覧／Graphへの移動はスクロールとfocusだけで、枝・位置・選択・zoomを変えない。広告の出入りはCanvasを再作成しない。
- PCは実内幅728px以上で728×90、スマホは画面幅800px以下かつ実内幅320px以上で320×50。1280pxの通常3列は左右190／250pxに収めて728px枠を確保。狭いPC／詳細を広げた状態など、728px未満はタグなし。既存スマホtagはPC用の代用にしない。狭いPCにも配信するなら管理画面で **PC用320×50のインライン枠を新規発行**し、取得した実tagを追加する（未発行・未実装）。広告自体を縮小／切抜きしない。
- スマホの広告はGraphの下へスクロールすると見え、Graphや詳細を覆わない。Graphの高さを広告のために縮めない。最初の検索ペインでは広告を読み込まず、Graphを開いた後はペイン切替だけで広告文書を再生成しない。空の配信内容では高さ0、実際の表示内容がある場合に90／50pxと小さなラベルの枠を確保する。
- ユーザーはEEA・英国にも提供すると指定。**日本と判定した新規接続では広告を標準表示、海外・地域不明では明示許可後。GA4は常に別の許可後。** 以前の広告OFFを維持し、従来の広告ONは明示許可として引き継ぐ。日本の自動ONを海外の同意とみなさないため、設定に `adsConsent` を保持する。設定を開いただけ／計測だけを変更した場合は広告の同意へ変換しない。撤回で広告文書を破棄し、別タブからの設定変更も反映する。
- 地域はDB-IP Liteの日本範囲だけを同梱し、サーバー内で接続元IPを二分探索する。IPを位置情報APIへ送らない／地域判定用に保存しない。言語・timezone・任意の国名headerで代用しない。正式VPSはloopback Webの手前でCaddyが上書きした単一XFF、TunnelはCloudflareの `CF-Connecting-IP`（pseudo IPv4時はIPv6）を使う。ローカルのみ標準表示で確認可能。Caddyに独自のtrusted proxy／XFF変更があれば適用scriptは停止する。複数IP・欠落・不正・表の期限切れは許可待ち。IP判定にはVPN等による誤差がある。
- [DB-IP](https://db-ip.com/db/download/ip-to-country-lite)のCC BY 4.0を守り、設定画面にクレジットリンク、派生データに原本URL・checksum・licenseを保持する。現在2026-10版、959,814 bytes（日本IPv4 13,877／IPv6 8,700範囲）。月次更新は `python3 scripts/update-advertising-country.py YYYY-MM` →関連test→通常Web build／反映。表が発行月初から90日を超えると自動ONを停止する。生成対象は広告の国判定でありKGへ投入しない。

### Cookie・外部送信の判断根拠

[AdMaxのCookie方針](https://corp.ninja.co.jp/privacy/cookie/)はCookie／広告ID・IP・端末情報等による配信・測定・最適化とオプトアウトを説明している。Cookieなし配信やTCF対応を推測で追加しない。日本で一律の事前opt-inを求めるAdMax公開要件は確認できず、外部送信の情報公開といつでもOFFにする操作を設ける。[電気通信事業法の外部送信規律の公式解説](https://public-comment.e-gov.go.jp/pcm/download?seqNo=0000268124)と[個人情報保護委員会Q&A](https://www.ppc.go.jp/personalinfo/faq/APPI_QA/)を参照。PPC Q8-3の個人関連情報の提供規律を、全Cookieの一律opt-in義務へ読み替えない。

EEAは[ePrivacy指令5条3項](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02002L0058-20091219)、英国は[ICOの広告Cookie等の指針](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-the-rules-apply-to-online-advertising/)に従い、広告による端末への保存・アクセスは事前許可で分ける。[Planet49判決](https://eur-lex.europa.eu/legal-content/en/SUM/?uri=CELEX%3A62017CJ0673)を踏まえ、日本の初期ON／予めチェックしただけの値を海外の積極的同意として使わない。許可／拒否の両方を表示し、拒否しても探索可能。許可時に事業者・配信／測定／パーソナライズ・設定変更を説明し、配信事業者一覧とprivacyへリンクする。

これはPlunodeからのタグ読込を制御する実装であり、AdMax／各配信事業者の処理全体の適法性やTCF連携を保証するものではない。既送信データは撤回操作で削除されず、Cookie管理・事業者のオプトアウトはprivacyの公式リンクを案内する。サービス側に撤回伝達APIの独自仕様を捏造しない。

### 今回の適用

```bash
sudo bash /home/develop/graph-ad-layout-20261015/scripts/activate-ad-layout.sh
```

Webのみの短時間更新。受入済みoperatorをaliasし、KG backup・readiness・失敗時の旧Web復帰は既存更新処理を使う。Caddy・Google・DB構造・既存データを変更しない。新しい広告枠やCloudflare操作は今回の適用に不要。地域判定はHTTPSからの新規匿名訪問で確認し、古いOFF設定があるブラウザを初回状態と混同しない。

## 確認された障害と修正（審査時の記録）

本人の管理画面ではPC／スマホとも「審査中」、広告未表示。公式FAQでは、掲載タグの広告リクエストを確認してコンテンツチェックが始まる。審査中の未表示を広告在庫不足と判断しない。

正式サイト・広告originはDNS／HTTPSとも疎通し、匿名rootは200、広告文書もiframeから200。**タグscriptの200だけでは設置確認成功ではない。** 実Google認証やデータの再投入はこの修正に不要。

| 段階 | 確認結果・対応 |
| --- | --- |
| 同意前 | 広告iframe／AdMaxへのリクエストなし。設置確認のために同意を迂回しない |
| 同意後の旧実装 | `/b/{tagId}` の `url` が空、PC／スマホとも400。cross-originのためSDKが親を読めず、fallbackの `document.referrer` も `no-referrer` で空になっていた |
| 掲載URLの修正 | 親→広告iframeだけ `referrerPolicy="origin"`。SDKは `url=https://plunode.net/` を送れ、実通信でPC／スマホとも200へ変化。探索path・query・hashは渡さない |
| 描画検出の旧実装 | SDKが自身の `admax-banner-*` IDを削除する。旧selectorでは描画を見失い、内容があっても高さ0のまま隠す |
| 描画検出の修正 | 配布タグを独自の固定containerに包み、その内部の実表示内容を確認する。配布scriptやSDKは改変しない。空iframeは引き続き高さ0 |
| 分離境界 | 広告は引き続き別origin＋sandbox。親DOM・会員Cookie・保存内容・共有tokenへアクセス不可。広告文書から外部へのHTTP Refererは引き続きno-referrer |

200への変化は掲載リクエストの受理であり、管理画面の審査完了や収益広告の配信を保証しない。AdMaxの自社バナーが見える状態と、審査後の通常広告を区別する。管理画面を代行確認したとは報告しない。

実タグによる修正候補の確認では、PCは200・本文0 byte、スマホは200・配信用JavaScriptが返り、外部配信先への接続も確認した。ただし、自社バナー／通常広告の可視表示は未確認。スマホ枠を一時的に可視の高さで確保する切り分けでも表示は確認できず、枠の高さだけを残る原因とは判断しない。これは正式originを検証ブラウザ内で隔離候補imageへ接続した結果であり、VPSへ修正を適用済みという意味ではない。登録URLと審査メッセージの本人確認が残る。

## 管理画面と実サイトの操作順

1. 忍者AdMax→**広告枠設定**で既存PC／スマホ枠を選ぶ。登録「サイトURL」は **`https://plunode.net/`**。広告文書の `ads.plunode.net` や開発Tunnelへ変更しない。サイトタイトルはPlunode、一般サイトとして内容に適したジャンルを指定する。
2. **タグ・SDK確認**で枠とタグを照合する。PC728×90は `ef4ef4eaf302d0f6b49e5114ad6d5213`、スマホ320×50は `93ba1c5c8d797794cf1c721bce01ff42`。サイズ・一般／成人の属性が違う場合は、画面上で変更可能か確認し、変更できなければ正しい枠の発行が必要。既存IDを推測で置き換えない。
3. PC／スマホともオーバーレイを無効、インライン用として確認。成人／出会い系広告の除外設定も確認する。PC向けタグをスマホで確認せず、スマホ枠は実スマホのUAで確認する。画面幅を狭めただけではPCのUAは変わらない。
4. 修正Web適用後、拡張機能で広告をブロックしていないブラウザで `https://plunode.net/` を開く。最下部の**計測・広告の設定→広告だけを許可→設定を保存**。GA4の許可は設置確認に不要。PC／スマホの両方でサイト下部へ進み、AdMax自社バナーまたは通常広告を確認する。広告自体はクリックしない。
5. 広告枠一覧の**審査中**をクリックし、表示される設置確認のメッセージを読む。公式FAQは通常30分程度、初回表示から3日以上続く場合にはURL・貼付け・リクエスト検出を確認する手順を示す。必要な場合だけ公式案内の2〜3回程度の更新で確認し、自動／大量リロードしない。
6. 「配信中」への変化は本人が確認する。表示・リクエストが正常でも審査が進まない場合は、管理画面のメッセージ、両枠のID、登録URL、同意後に表示される構成と広告の分離originを忍者サポートへ伝える。こちらから問い合わせは送信しない。

拒否した人・同意ボタンを操作しないクローラーにはタグを実行しない。人が同意して表示した広告リクエストでの設置確認が公式手順に合う。自動審査がこの条件をどう扱うかは事業者側の判断であり、クローラーだけ広告を強制実行する仕組みを作らない。

## 配信が進まない場合の切り分け

順番は **同意→iframe200→タグscript200→広告 `/b/` の掲載URLとstatus→自社バナー／通常広告の描画→管理画面の審査結果**。どの段階かを記録する。通信失敗・400・CSP違反・SDK実行エラー・審査中を「在庫なし」とまとめない。2xxかつ空の応答も、審査状況と応答内容が分からなければ未配信の理由は未確定とする。

現行の広告CSPは広告文書内に限ってHTTPS配信先を許可し、親アプリの制限を一括解除しない。公式CSP FAQは配信ドメインが随時変化するため個別domainの固定許可を非推奨としている。今回の400はCSPでなく空の掲載URLによる失敗を実通信で確認した。

**ads.txt** は公式が推奨している。管理画面 **広告枠設定→ads.txtを取得** の本人用の内容を取得し、`https://plunode.net/ads.txt` へ置く。内容はタグIDから推測せず、空のファイルで設置済み扱いにしない。未設置だけを今回の審査停止原因と断定しない。取得内容が必要なため、今回の設置は未了。

## 修正の適用

ローカル3200／Tunnelは検証済みmainのWebを更新する。VPSはWebのみの更新bundleを使い、Caddy／公開設定／Google設定／既存データを維持する。sudo操作は既存の管理者境界。

```bash
sudo bash /home/develop/graph-admax-review-20261015/scripts/activate-admax-update.sh
```

既存operatorのdigestを照合し、KG backup→Web更新→readinessを行う。更新失敗時は既存処理が旧image設定へ戻す。DB再起動・データ再投入・広告originの変更はしない。VPS適用と本人の審査結果は別に確認する。

## 参照した公式資料

- [審査中の意味・登録URL・広告リクエスト確認](https://www.ninja.co.jp/admax/help/faq/9448/)
- [広告タグの取得と設置](https://www.ninja.co.jp/admax/help/faq/4281/)
- [広告が表示されない場合のタグ・端末・ブラウザ確認](https://www.ninja.co.jp/admax/help/faq/10325/)
- [スマホインライン枠の作成と属性](https://www.ninja.co.jp/admax/help/manual/10494/)
- [既存PC枠の修正範囲](https://www.ninja.co.jp/admax/help/manual/10467/)
- [CSP設定](https://www.ninja.co.jp/admax/help/faq/14005/)
- [ads.txt取得手順](https://www.ninja.co.jp/admax/help/manual/12162/)、[設置推奨の案内](https://www.ninja.co.jp/information/all_category/topic/12191/)
