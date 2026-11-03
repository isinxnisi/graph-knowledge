# U5 投稿フォームの説明・密度・再確認の修正

2026-11-03。利用者からの入力の意味が分からない、フォームが長い、認証再確認の通信失敗で画面が消える、という指摘に対応する。

## 今回の変更

- 必須／任意と短い具体例を入力箇所へ追加。「内容」は「登録する事実」、「具体的な関係名」は「矢印に表示する言葉」。資料名・場所・原文の役割を区別する。
- 人物・作品などの名前と分類を、根拠のある事実と一緒に登録する入口を追加。既存Entity＋noteと共通の受理契約を使う。人物専用の公開経路や、名前だけの公開を追加しない。
- 一覧用の任意名、補足・時期、紙資料の書誌を折り畳む。PCでは事実と資料を2列にし、狭い画面では縦に戻す。枠の重なりと余白、textarea初期高さを減らし、スマホの入力文字16px・操作44pxは保つ。
- 通常の本人取得を5分の鮮度で共有。focus・タブ復帰での強制取得を廃止。同一プロフィールのuserオブジェクトを保持し、入力面の不要な再初期化を避ける。
- 一時的な通信失敗では、確認済み本人と入力をメモリ内で保持。小さい再接続案内を出す。初回未確認・401・別本人／明示logoutは区別し、古い応答を採用しない。APIの都度認可を省かない。
- 会話の通常focus・表示復帰は直前取得から30秒以内なら再取得せず、通常の通信失敗で画面を隠さない。明示の権限変更・認可失効は従来どおり隠す。
- private入力のlocalStorage保存、DB migration、AI model／利用枠・共通Kev、本番VPSの変更はない。

## 検証

会員PostgreSQL＋OIDC fixtureの統合32件成功。新しい人物の分類・名前・事実・資料が共通の自動受理契約を通り公開正本へ到達する。実Google／実AIによる新しい人物公開を確認した意味ではない。

UI・認証検証では、通信失敗・タブ復帰で未保存inputとDOMを保持、プロフィールの再取得頻度・失敗時の間隔、401と別本人切替、遅い旧応答、既存Capsule・会話のprivate認可を確認する。最終結果と配置識別は下記へ追記する。

## 制約と次工程

現在の自動公開は、匿名で取得できるHTTPS HTML/textと原文引用が必要。本のみの資料は草稿に保存できるが、この自動公開経路では扱えない。公開前に不足を案内し、不要なAI依頼を減らす。

U5全体の完了ではない。異議・運営例外対応と総合確認は引き続き次のまとまり（基本追加1回程度の推定）。U6以降の収集・統合・正式配置を今回のフォーム修正へ混ぜない。


## 最終結果と配置

- source `b204e2b8780ccabbe18917f6ec131f9bf7a10ef1`、build `uZweEcFz-KDdbAVln1V3N`。mainと作業branchへ通常push済み。記録だけの後続commitでは再buildしない。
- UI／本人表示／既存Capsule／会話等7ファイル88件、会員DB・OIDC fixture統合32件、変更箇所lint、型検査、正式モードbuild成功。非表示中に別本人を確認した後のCapsule一覧の再取得も検証し、復帰時の取りこぼしを補修した。
- 検証用exportをworktreeの外 `~/.cache/plunode-builds/u5-form-b204e2b8` に置き、古いexportのlockfileやソースをbuildの祖先に含めない。022のtraceを確認し、private runtimeのkey／profileをtraceしないことを確認。旧exportのTypeScript混入を `.local` 除外で防いだ。
- 3200／HTTPS βへWebを反映し、review workerを同じsourceで再開。private profile／keyはhashが同じ。DB migrationなし、member ledger23件、public34＋member_knowledge13 tableを保持。直前の互換build `rbLDeOtrWsJT7AL8c8eLV` はprivate `.local/u5-form/compatible-build-rbLDeOtrWsJT7AL8c8eLV` に保持。
- 3276はU4の資材を維持。本番VPS・共通Kev・AI model／利用枠は変更しない。

### 実Googleでの操作と通信

HTTPS βで既存のWebb投稿を開き、事実・関係の両端・矢印の語と資料を横に見渡せること、任意名・補足・時期・書誌の折り畳みを確認。1920×911の画面で、項目1の事実と資料一式、その下の項目2見出しまで表示された。証跡は開発PCの `u5-form-guidance-desktop.png`。

新規の「人物・作品など」から名前・人物分類・事実を入力し、資料なしの本人草稿を保存した。確認用の架空データであり、公開依頼やAI送信は行っていない。保存ID `1577b8f2-f076-4909-8c66-2318f3bc6516`。再読込後も名前・人物分類・事実が保持され、任意名・補足の展開も操作できた。他人の投稿や利用者が編集していたPLUTOの草稿は変更しない。

途中で外部接続が1033になり、保存の結果不明・同じ操作の再試行が表示された間も名前・分類・事実が画面に残った。この最初の試行ID `34087dd9-a923-4ee8-a334-65130f751484` はDBに存在しないことを確認した。アプリ内の認証エラーだと決めつけず、別タブの公開statusでもCloudflare Tunnel errorを確認した。

既存の `plunode-beta-http2-recovery` のscope label・image・http2・公開portなしを照合して、この補助containerだけ再起動。4接続の登録後、HTTPS βの本人データ読取と上記の草稿保存が復旧した。Windowsサービスや他サービスの共有connector、DNS／Access／公開範囲は変更しない。先行記録と同様にトンネルの長期安定性・根本原因の解消を実証した意味ではない。

スマホ用の入力文字16px・ボタンのタップ範囲44px・縦積みCSSを維持。確認接続の復旧後に実際の390×844の表示を確認し、document幅380pxで横はみ出しがなく、資料欄まで通常のページスクロールで読めた。証跡は `u5-form-guidance-mobile.png`。幅のoverrideは最後にresetし1920×911へ戻した。iPhone実機は未確認。通信失敗・401・別本人・focus／visibilityは上記の自動テストで確認し、実ブラウザでは自然発生した外部接続失敗による入力保持を確認した。

### 開発PCのGitHub認証復旧

pushで旧式のパスワード画面が反復。実物は Git Credential Manager for Windows 1.19.0で、新GCM向けの `github login` 指示はこの版に適合していなかった。旧版の `version` とファイル情報で特定した。先の案内を訂正し、待機中の自分のpushプロセスだけを終了した。

[公式GCM 3.0.2](https://github.com/git-ecosystem/git-credential-manager/releases/tag/v3.0.2)のuser installerを使用。GitHub release assetのSHA256 `51c861489b3f498314526f53d8fa3e1c6e790a439f0807f8d1a6f72ec2946b11` とMicrosoft Corporationの有効なAuthenticode署名を照合。管理者用のsystem installerは使わず、ユーザー領域へ更新した。既存ユーザーGit設定はprivate `.local/u5-form/auth-settings-backup` に退避。

Windows・WSLのcredential.helperを、継承の旧helperをリセットしてuser版GCMの実パスへ向けた。[公式WSL手順](https://github.com/git-ecosystem/git-credential-manager/blob/v3.0.1/docs/wsl.md)に従い、WSL側では空白をescape。新GCMのブラウザ認証で既存GitHub本人を確認し、Windows・WSLの両方で非対話の通常pushが通った。パスワードやtokenはチャット・git・検証ログへ保存していない。Git本体の入替え、SSH鍵の新規作成／GitHub登録、認証の平文保存はしない。
