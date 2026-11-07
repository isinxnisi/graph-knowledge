# ChatGPT資料収集のAPI直送・2026-11-07

## 現在地

R3b是正：API接続完了、初回実行・予定設定が残り｜R4はa完了・bまで｜全体はR6まで。

API直送は既定として進める。Codex収集予定はPAUSED。実装・17件・lint・型検査と、member backup→別DB復元→035移行・旧行／checksum／再実行を確認。fixture OAuthで認可コード・署名付き同意・audience／scope・refresh・失効を確認した。2026-11-08に実Googleの収集接続承認・ChatGPTでの5ツール表示を確認。初回配送・同一会話での予定実行は未確認で、R3b全体の完了扱いにしない。

## 設計

既存GoogleログインとBetter Auth 1.7.7へcollection専用OAuthを追加。MCPの5操作から既存mission APIを使い、DB管理や会員データのtoolsは公開しない。独自の認証方式を一から作らず、PKCE・CIMD・JWT検証・refreshをライブラリで処理する。変更は追加035のみで000〜034は不変。

実行資格はserverのprivate client／checkpointに保持し、会話へ返さない。runIdと内容digestで完了済み再送を回復し、異なる内容は拒否。複数プロセスのcheckpoint操作をadvisory lockで排他する。Codexモデル呼出・課金サービス・共有Kev変更は含めない。

## 配置と未確認

app source `12c90a745bdef866f21d7d39a884e97c46c8b739`、build `PUEG4r4rcm6iz8en64hZV`をmain／3200へ反映。HTTPS βでもTOP・OAuth metadata・resource metadata・接続案内200、未認証MCP401＋challengeを確認。初回のresource metadataの誤った転送pathを修正し、追加migrationなしでWebを再配置した。3276・本番VPSは未変更。ChatGPTからの接続承認と、同じ会話に継続する予定の初回実行を残す。実行元・利用量が確認できていない状態を、API配送やfixture結果だけで成功扱いにしない。

## 実測

- 境界17件＋既存会員を含む107テスト成功、対象lint・型検査、型検査込みproduction build成功。全データの再AI評価は行わない。
- 035はOAuthテーブル8つのみ。旧76テーブルの行、既存35件のchecksumを保持しledgerは36件。別DB復元・migration再実行で不変。知識原本3テーブルも不変、knowledge DBのmigrationは行わない。
- 切替直前member backupは7,169,973 bytes、sha256 `2e967e43d6c9e4575ad0d8557c1a92706ca36778b330fb8ec881c0de0d2ef253`。privateな `.local/mission-mcp/activation-backup-20261107T130649Z/member.dump` に保存。別DBへの復元検証後に既存βへ適用。
- 既存15 private設定／資格fileはhash不変。新規の `beta-mission-mcp.json` は固定origin・既存clientのpathだけ。Google設定・共有Kev・KG／AI artifact・本番VPSは変更しない。
- Nodeの実配送User-AgentとJWKS取得User-AgentでHTTPS βのJWKS200。Python標準User-Agentの確認だけはCloudflare1010となったため、実clientと同じUser-Agentで疎通を確認した。Cloudflare設定は変更していない。
- ChatGPT WebのカスタムMCP設定で、CIMDと `https://chatgpt.com/oauth/client.json`、stable callback、scope `missions:collect`、正しいβのendpoint／resourceが自動検出された。基本scopeに `offline_access` を設定。作成・OAuth同意の前で本人へ引継ぎ。
- アーカイブから保存したPRIVATE pluginはMCP設定1件・skill1件を含む。配布ページのWeb表示はデスクトップ用であり、Web接続は別途カスタムMCPから行う。配布ページを接続済みと報告しない。
- ChromeのDOM操作は成功、画面画像の取得だけがCDP timeout。ブラウザ全体が操作不能とは扱わず、再起動を求めていない。

## 依存更新の確認

新しい認証境界の依存確認で、入力schemaのZodを4.6.7、lock内のdevOptionalなUndiciを8.12.4へpatch更新した。更新後も会員・MCP境界の107件が成功。`npm audit`は5 packageから3 packageへ減り、Zod／Undiciの指摘は解消した。既存Next 16.3.8（critical）、fflate（moderate）、Vite（high）の指摘は残る。これを到達可能性や悪用の実証とは扱わない。Nextのminor更新をこの接続是正へ無断で広げず、R6の正式公開前に更新・影響確認を行う項目として引継ぐ。本番VPSの安全性確認が完了したという意味ではない。

## 残り

ChatGPT側での初回の実配送、一つの同じ会話に継続する予定の作成・実行・利用枠の確認を残す。実Googleの接続承認・5ツール表示は完了。API実装、fixture認証、metadataの自動検出だけでR3b完了とはしない。通常Graph・会員の実画面の追加確認も接続後に行う。

アプリソースは日本語commitで作業branchへ通常push済み、検証済みSHAをmainへfast-forwardし、3200／HTTPS βへ配置した。最後の文書commitも同じbranch／mainへ通常pushして終了する。holdは本人接続待ちの区切りで解放し、接続後は再取得する。本人の権限付与はPlugin Creatorの `SKILL.md` 指示先 `references/server-access.md` の “Let the user complete credentials, MFA, and OAuth consent there.” に従って本人操作とする。

## 最終patchの配置

Zod／Undiciのpatch後の107件・型検査込みproduction buildが成功。上記app source／buildをWebだけ再配置し、3200とHTTPS βで計12応答を確認した（通常ページとmetadataは200、未認証MCPは401）。今回のWeb再配置にDB移行はなく、035までの既存適用を維持した。private設定16件のhashを保持。review WorkerのみWebと共に再起動し、他4 Workerは停止していない。本番VPS・3276は未更新。ChatGPTの作成・接続承認画面は本人操作待ちのままで、実Google／実配送／同一会話での予定実行は未確認。

## 接続時の5秒timeout修正

本人の接続で `invalid_client: Metadata document fetch timed out after 5000ms` が発生。このPCのNode `dns.lookup` は5,075ms、同じホストの `dns.resolve4` は35ms、従来のCIMD transportのHTTP全体は5,398msだった。公式CIMD libraryの5秒固定期限に、OSの名前解決待ちだけで達していた。単なるパスワードエラーやGemini利用量の問題ではない。

収集OAuthのtransportだけでA／AAAAを直接解決し、全応答が公開IPであることを確認して一つへ接続を固定する。TLSのhostname／SNI検証、期限によるDNS取消、転送禁止、URLの信頼先限定を維持する。会話や受信要求のCookie・Authorizationはメタ情報の取得先へ転送しない。PC全体のDNS設定・他Workerの資料取得・共有Kevは変更しない。

修正後の実ChatGPT metadataは200／2,345ms、署名検証用JWKSは200／2,170msで取得できた。新規のtransport6件と既存MCP境界5件、対象lintが成功。本人によるOAuth再接続とChatGPTからの初回実行は、β再配置後に引き続き確認する。DB変更はない。

DNS修正app `3d5d3291cf5da26aca8c9ca04d495c57044ab88c`／build `nXBDYXdtSB0JWDLmZGg_1`をmain／3200／HTTPS βへ再配置。11件・対象lint・型検査込みproduction build、2環境の12応答が成功。CIMD実文書を解決する認証開始要求も302で `/collection-connect` へ進み、5秒timeoutを解消した。DB migrationなし、private設定16件のhash不変。作成済みのWebプラグインの「アプリの接続を続行する」を本人へ再引継ぎ。実Googleの同意・実ChatGPT配送・予定実行の成功はまだ未確認。画面画像の取得も今回は成功した。

Chromeの既存βタブを新buildで再読込し、既存Googleログイン、運営メニュー、Webbテーマ構成版4・時期なし3件・年表7件と根拠表示を確認。長時間開かれていた旧タブの接続アラートは再取得だけでは残ったが、再読込後は消えた。この既存セッション確認を、新しいOAuth権限の同意成功とは扱わない。

## 再接続で判明したIPv6経路の追加修正

本人の再接続で `Failed to fetch metadata document (network error or redirect blocked)` が発生。βの実ログは `connect ENETUNREACH` と公開IPv6宛の接続失敗を示した。前回のtransportはIPv4 DNSが応答しなければIPv6へ切り替えており、このPCでIPv6経路が利用できない点を扱えていなかった。先の単発疎通だけで本人接続の成功とは扱わない。

この認証接続だけIPv4のA応答へ固定し、DNSは1秒・最大2試行、接続先IPの検証・pinning・TLSのhostname検証・5秒の全体期限を維持する。A応答が得られなければIPv6へ逃がさず失敗を返す。socketの二度目のerrorも処理し、エラー段階とcodeだけをserverログへ残す。Cookie・認可code・token・要求URLはログへ含めない。

別プロセスで2回、実metadata／JWKSの両方が200となり、順に314／177ms、237／158ms。transport7件＋MCP境界5件が成功。PC全体のIPv6／DNS設定は変更しない。β再配置後の認証開始・本人接続は別に確認する。DB変更なし。

IPv4修正のapp `87ad49c3988af72c4453817b5c707b18ae088c58`／build `kQOYaMAfRba265KQjs2xT`をmain／3200／HTTPS βへ配置。型検査込みbuildと2環境12応答、認証開始302が成功。新しいappでは、実ブラウザからChatGPTの「アプリの接続を続行する」を押し、既存Googleセッションを引き継いでPlunodeの「資料収集の接続を許可」画面まで到達した。そこで本人へ引継ぎ、同意buttonは押していない。実接続の完了・配送・予定実行はまだ未確認。DB変更なし、private設定16件のhash不変、本番VPS／3276は未変更。最初のbuildはNodeのRequestOptions型にない冗長なautoSelectFamily指定で停止したため、その指定を除去し、IPv4 pinningの7件を再確認してから新しいSHAでbuild・配置した。

## 本人許可後のトークン発行・時刻同期待ち

本人が許可し、consentは1件、access／refresh tokenは0件。ChatGPTからのPOST token要求はサーバーへ届いており、Originなし・form形式・Authorization headerなし。応答401 `invalid_client` の署名分類となった。追加の機密値なし診断でissuer／subject／audienceと公開鍵IDの一致を確認し、JOSEが署名検証後の `ERR_JWT_CLAIM_VALIDATION_FAILED`／`nbf` で拒否していると判明。JWT自体・code・state・Cookieを保存／表示していない。許可済みの再開は追加の本人同意なしで再現できた。

HTTP DateはPCより約1秒先。Microsoft標準時への `w32tm /stripchart /computer:time.windows.com /dataonly /samples:3` は+1.5851／+1.5807／+1.5802秒で、WindowsとWSLの時計は同程度。Windows Timeサービスは停止（0x80070426）。Codexの `Start-Service -Name W32Time` はサービス開始権限不足で失敗した。管理者PowerShellで以下を本人へ依頼した。

```powershell
Start-Service -Name W32Time
w32tm /resync
```

同期結果後、Windows／WSL／外部時刻を再確認する。WSLの時計が追従していなければRTCから同期する。署名・nbf・期限検証を無効化／緩和して回避しない。既存の許可で再接続を再開し、トークン発行・MCP toolsの接続・ChatGPTからの配送を確認する。接続確認後は原因確定用の詳細assertion診断を取り除き、機密値なしの成否ログを残す。

診断追加はformatter／credential非表示3件、JWT claim分類1件、既存transport7件を確認。app source `e7f3acccb3236fae8799a7b15cee3943e493588a`／build `bkKmHOZGJGlK4D6HLN1PX` の型検査込みbuild成功、main／3200／HTTPS βへ配置。DB変更なし、private設定16件は不変、VPS／3276は未更新。既存107検証は以前の基準として活用し、全件の再AI評価は行わない。

ビルド前の空き容量監視で一度停止。rootの `fstrim -v /` でWSLの未使用5.7GiBをtrimした。Windowsの空きは約7.47GiBで、既存cacheの小差分buildを7GiB以上から開始し、6GiB未満で停止する監視と3GiBのNode heap上限を維持した。サービス停止・ファイル削除・volume削除は行っていない。

## 2026-11-08 時刻同期後の実接続成功

本人の再同期コマンドが正常終了。W32TimeはRunning・起動種別Manual。Microsoft標準時への差は-0.0011／-0.0022秒となった。WSLのRTC書換えは行わず、署名・nbf・期限の検証も緩めていない。

保存済みの本人同意から接続を再開し、実token要求の200を確認。CIMD clientの同意1・refresh3・client assertion3を安全な件数だけで照合した。access tokenはJWTのためDBのaccess-token行0を未発行と解釈しない。ChatGPT Webのアプリ詳細にclaim_collection／observe_collection_sources／deliver_collection／finish_empty_collection／fail_collectionの5操作が表示され、接続を続行するアイコンは消えた。これを接続成功とし、まだ研究・配送の実行成功とは扱わない。

原因確認用の追加assertion再検証を削除し、機密値なしのrequest／response分類ログを保持する。既存の「Plunode GitHub接続試験」はAI教育で使用中と確認したため収集先に転用しない。Codex収集予定はPAUSEDを維持。収集専用の一つのChatGPT会話・実行元と利用枠の確認、初回配送・予定実行を残す。

## 通常運用版への仕上げ・残る本人回答

追加assertion診断を除いた13テストと対象lintが成功。型検査込みproduction buildは145.6秒で終了し、監視中のWindows空き容量の最小は7,637,745,664 bytes。既存build cacheを利用し、再AI評価や追加のDB移行は行っていない。

app `12c90a745bdef866f21d7d39a884e97c46c8b739`／build `PUEG4r4rcm6iz8en64hZV`をmain・3200・HTTPS βへWebだけ反映。両originの12応答を確認（通常ページ・metadataは200、未認証MCPは401）。private設定16件のhashを保持。review WorkerだけWebとともに再起動、他4 Workerを維持。実GoogleセッションでWebb構成版4の時期なし情報・年表・並列関係図を再訪できた。本番VPS／3276は未更新。

ChatGPTのChatモード、GPT-6・思考量極高の入力画面を確認。Workへ切り替えていない。公式文書は現時点でChatのモデル利用とWork／Codexの利用枠を区別しているが、予定実行自体が無料・無制限であるとはしない。実際の予定でのモデル・利用区分は設定後の表示で確認する。

ChatGPTの有効予定はAI教育、旧「Plunode 収集進行チェック」は一時停止のままで、どちらも変更しない。誤接続だったCodex収集cronもPAUSED、毎時20分の設定を保持している。収集専用のChatGPT会話を一つ作って継続するか、既存の収集会話を指定するか、本人回答待ち。新規会話はまだ送信・作成していない。接続済みプラグインを選んだ初回1計画の依頼文はChromeの入力欄に準備済み。回答後に初回配送→同一会話のChat予定→次回時刻・実行結果の順で確認する。

参照：[Chatのモデルと利用枠](https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt)／[予定実行とCodex automationsの区別](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)。接続成功画面はCodexのvisualizationsフォルダーに `plunode-collection-connected.png` として保存。

## 2026-11-08 専用会話の初回実行と配送指定の修正

本人が専用会話を最初に一つ作って継続する方針を明示。Chatモードで会話 `6aef440d-ceac-83ee-b59b-163349281c60` を作成した。0:30のclaimは正常・対象なし。既存のWebb計画は同日13:12予定で、運営画面の最終接続時刻とも一致した。既存計画の予定・AI教育・旧収集進行チェックは変更していない。

実配送確認用「β確認｜ChatGPTのAPI直送」（plan `673af090-5228-4318-8e34-c1e4d66533ae`）をβの通常フォームから作成した。NASAの指定記事1資料、既存副鏡Recordへの根拠追加1項目に限定し、終了後停止する。0:34にChatGPTがrun `ccab9282-d780-4bf3-a709-93fda1c7f776` を取得し、原文取得にも成功したが、配送はMISSION_THEME_CHANGEDで拒否されreceiptは発行されなかった。テーマが実際に変わったという判定ではなく、各item.themesが取得時の固定テーマID／版と一致しない場合の検査だった。失敗を新情報なしの成功とは扱っていない。

MCPの配送説明に、add-evidenceを含む全項目で取得snapshotのテーマID／版を指定する条件を明示した。不一致時には秘密値を返さず、同じrunで指定を修正して再送できる案内を付けた。テーマ版の照合や権限を緩めず、送信データの自動付替えもしない。16テストと対象lint成功。モデルはfail_collectionでwaitingへ移したため、既存の15分再試行待ちを尊重する。修正後の配送・同一会話の予定実行はまだ未確認。

## 同じ会話での予定起動と試行世代の不具合

ChatGPT側に「Plunodeのテーマ資料を収集」を作成し、予定一覧の有効表示、Asia/Tokyo、毎回同じチャットを使う設定を確認した。会話はChatモードのまま、モデルは明示変更せず既存環境を継承。予定本文から試験専用の「新しいEntityを常に禁止・add-evidenceだけ」という過剰な限定を取り除き、各計画の指定に従って新しい対象・関係・出来事・背景・根拠追加・明示訂正を扱う一般形にした。許可ホスト内での資料URL探索も維持した。

同じ会話に予定の結果が追加され、β側にも0:51:09のclaimを確認した。この回はnext_attemptの0:51:41より前で正常・対象なし。予定一覧は次回1:53を表示。0:55に予定メニューの「今すぐ実行」を使うと、同じrunの新しいgeneration=2を取得したが、observeでクライアントがMISSION_ALREADY_FINISHEDを返した。サーバーのrunはleasedであり、サーバーが終了したのではなかった。

原因はprivate checkpointのcompletedがrunIdだけを見て、generation=1のfail完了記録をgeneration=2にも適用したこと。完了記録にgenerationを保存し、サーバー確認済みの新しいleaseがある場合は古い世代の完了記録で遮らないよう修正した。旧checkpointも読み取れる。完了済みの同じ配送の再送回復・内容変更拒否は保持する。旧形式／新形式のfail→再claim→observe→deliverを2ケース追加し、既存を含む18テストとlintが成功した。既存の新しいleaseから再開でき、DBや待ち時刻の書換えは行わない。

## API受付成功と、既存対象指定の入力検査

修正後の予定の「今すぐ実行」から同じrunを再開し、1:03に原文を再取得、1:04に直接配送receipt `e93461ca-e6fb-47ac-95c2-abc1d403a6b4` を受け取った。テーマは取得snapshotの版5を指定できた。サーバーrunはdeliveredで、ChatGPTも受付と公開を区別した。

公開前の項目準備ではneeds-changesとなった。immutable payloadを対象欄だけ確認すると、add-evidenceのabout(record)はあるがcorrectionが未指定だった。共通受理は両方に同じ固定Record pinを必要とする。MCPにこの条件の説明と受付前検査を追加し、add-evidence／correct-recordはabout(kind=record)とcorrectionを一致させ、correct-recordには理由も必須とした。自動的に対象や版を書き換えず、欠落・不一致はMCPの入力エラーとして返し、同じrunで修正できる。資料本文や資格は検査結果へ出さない。

最初のreceiptは変更せず保持し、公開成功とは扱わない。確認用の同じ計画を通常UIで再設定し、別のrunで有効な入力を再確認する。対象指定の不足・不一致・訂正理由不足の3ケースと、修正後にbridgeへ渡ることを確認する回帰テストを追加した。

## 根拠だけを追加する入力の再確認

予定の再実行でreceipt 50675f34-b368-4f65-b748-2fc70b771d34を受領したが、公開準備でneeds-changesとなった。固定snapshotとimmutable payloadの差分は、record.aboutRecordへの余分な自己参照と、既存evidenceの脱落だった。事実文そのものは保持されていた。受付成功を公開成功とは扱わず、このreceiptも書換えない。

共通のsubmissionIntentIssuesをmissionの耐久受付前にも適用し、add-evidenceの元内容・既存根拠の変更をMISSION_EVIDENCE_BASELINEとして返す。同じrunで固定snapshotのcontentを保ち、新しい根拠だけ足すよう案内する。サーバーが入力を勝手に直したり、元の根拠を失う入力を受理したりしない。自己参照・既存根拠脱落の実不具合2ケース、修正後の通過、資格を含まない修正案内と既存client／MCPを合わせ24テスト・対象lint成功。今回もDB移行なし。
