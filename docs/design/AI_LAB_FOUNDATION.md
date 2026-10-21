# Plunode AI育成ラボ：隔離した最小基盤 v1

次工程（2026-10-22）：[初稼働準備と観察画面](AI_LAB_OBSERVER.md)。以下は初版時点の範囲・設計記録。共有Kev・本線への変更禁止と不変履歴の契約は継続する。

2026-10-21。ユーザー指定の「着手計画 v0.1」第11章を今回の実装範囲とする。第1〜10章は到達目標・設計方針、第二世代AI・本線への参加・他サービスへの展開は将来の方向。今回の結果は[実測記録](../verification/AI_LAB_20261021.md)。

## 今回の位置

`experiments/ai-lab` に、公開済みKGの固定部分集合→候補→判断→検証→不変記録→別工程の採点→比較→公開用JSON、という一巡を置く。Python標準ライブラリと既存のTypeScript validatorだけを利用する。常駐DB、queue、追加package、通常実行時のCodex呼出はない。

main `d237480689e28d68cd266980d52de163d99397c6` を起点とする独立worktree・`codex/ai-lab-foundation` だけで実装する。mainの未追跡memoや別worktreeのcommitは取り込まない。共通Autopilotロックはworktreeを分けても必須。今回の明示指示を優先し、mainへのmerge、3200/beta・3275/graph-com・VPSへの配置はしない。

共有Kev、本線Compose・依存・cache、公開KG、会員DB、コミュニティの認証・参加・投稿を変更しない。Web画面や会員APIに実行入口を追加しない。CLIによる記録の再表示とJSONの配信準備は今回、製品の観察画面は次工程。

## 固定入力と候補

既存 `datasets/connectivity/issue-34` の公開済み比較fixture・manifest・公開観測を通常byte SHA-256で照合し、`fixtureV4Schema`／`validatePublicRelease`を再利用する。`prepare.ts` は6 Entity・8 Claim・4 Source・8 Citationを元UUID・全fieldのまま投影する。観測revisionは `88437056-b74f-42ab-88c0-33ed435bdccc`。保存観測の再利用であり、現在のKGの全件再取得ではない。

実例はPLUTOの著者／監修／プロデュースと、浦沢直樹の別作品。少数の開発用4課題で、監修者選択、指定方向に候補なし、上限で保留、著者を経由した別作品を扱う。公開snapshot内の不存在を世界の不存在としない。

候補生成は最大2段・6候補・100辺確認、単純経路のみ。既訪問を除き、元Claimの方向と実際の辿り方向を別fieldで持つ。肯定・支持Citation・非demo Sourceを必須とし、RoleとISBN scopeをコードで照合する。未指定Roleを著者へ補完せず、異なる刊行物scopeを一つへ統合しない。上限に達したら `completeWithinSnapshot=false`。未完集合に対するSTOPは無効、HOLDは可能。

`id-order-v1` は固定順の非AI基準、`purpose-role-v1` は課題の明示Roleを用いる非AI改善候補、およびKevの指示文候補。ルール指標とモデル確率は別型。候補選択だけを返し、自由文の内面や生成していない説明を捏造しない。表示上の説明は元経路・Claim・Citationを使う。

## Kevと資源

`runtime.Kev` は固定loopback `127.0.0.1:8009` の `GET /v1/runtime` と `POST /v1/systemone` のみ。プロキシ環境変数・redirect・別provider・自動retryを使わない。0.8Bのrun、model revision、base/revision、Kev commitを固定し、応答の配備stampも照合する。確率の選択肢集合、有限値、範囲、総和を検査する。未知候補は失敗。

暫定の**単回推論開始条件**はGPU 75℃未満、GPU使用率5%以下、空きVRAM 2GiB以上、WSL available RAM 4GiB以上、出力filesystem空き1GiB以上。診断不能なら未接続保留。これは製造元の安全仕様や連続運転保証ではなく、今回の78℃と過去91℃観測を受けた保守的な開始条件。送信直前に資源と共通ロックを再確認する。

1コマンド1課題1回、wire本文12,000 bytes以内、HTTP全体45秒。実token数は共有APIの4,096 token制限で検査され、超過422を保存する。byte上限をtoken数と呼ばない。候補や根拠を黙って切り詰めない。実行直前・直後のRAM/VRAM/温度とクライアントwall/CPU/peak RSSを記録。クライアントCPU・RSSはKev推論プロセスの消費ではない。

共有サービスの受理済み推論はクライアントtimeoutで取消保証がない。timeout／送信後切断は`unknown`、再送なし。45秒はGPU処理の強制停止上限ではない。実行中温度のhard stopや共有GPUの予約は今回未実装なので、連続運転・学習の許可へ拡張しない。

## 不変履歴と比較

- AI安定ID `fe93a431-85cf-4fae-8b84-127e8bf866a7` はモデル名と別。表示名、運営主体 `plunode`、run UUIDが将来のAIIdentity／活動参照との接点。人間Userや万能Actorを作らない。
- `runs/UUID/start.json` をfsync＋no-clobberで保存してから判断を始め、送信前に`dispatch.json`、結果を`result.json`へ別保存する。JSON内容hashを持ち、同名異内容は拒否。過去失敗を成功に変更しない。
- 同じrun UUID・同じ入力/コード内容は保存結果を返し、二重送信しない。中断startは`interrupted_or_unknown`。`recover`でunknownの結果を追加し、推論を再開しない。明示した新UUIDだけが別試行。
- code commitと実行source hashを併記。コード内容が不変の文書commit後は同runを再表示できる。実行コードの変更で同runを再利用しない。
- model/base/adapter、policy、KG hash/revision、task/evaluation/scoring、training data版を独立して持つ。未学習はtraining data/adapterともnull。親runへ版の由来を結ぶ。
- 採点は結果seal後の別コマンド。モデルはlabelsを読まず、requestは許可項目から組み立てる。採点の正解はAI作成・`pending-human`なので`draftLabelMatch`に留め、`semanticAccepted=null`。
- 同じtask/KG/labels/scoring/review状態だけを比較し、改善・悪化・変化なし・評価不能を区別。評価や採否は別の不変記録。採否に理由・時刻を持ち、不採用版も残す。採用の記録だけで本線への権限を増やさない。

開発4課題は配線・失敗分類の確認であり一般化性能の証明ではない。学習用と最終評価用は**空・未準備**。将来は人物/作品/元Claimを含む集合を跨いだ漏れを`check_splits`で拒否し、最終評価の秘密labelsを改善担当と実行環境から分離する。今の同一OSアカウント内のファイル分離はアクセス制御の代用ではない。公開例を最終評価として再利用しない。

## 公開artifactと画面への接続設計

`export` は固定公開taskとsnapshotに再照合して、新しいJSONへ許可項目だけを投影する。内部パス、診断情報、raw応答、wire、error本文、labels、採否理由を出さない。試験doubleは公開拒否。`activate-local` は同じ投影との完全一致を再検査し、内容hash別のreleaseを保持してcurrent pointerを原子的に切り替える。旧artifactの再指定で復帰する。これは隔離directory内での検証であり、VPS配置権限や配信機能ではない。

次の観察画面は既存 `SiteHeader`／Home／Explorerレイアウトを再利用する。Home/Graphの小さい入口→AIプロフィール→run一覧/結果→既存 `/explore/UUID` と `/?read=claim&dataset=public-kg&id=UUID`→元ラボ・元探索へ戻る、を同じアプリ内で設計する。戻り先は既存探索URLとセッション内の位置を保持し、Graphの保存schemaを変更しない。入口追加は本線担当と合わせる小差分とする。

今回JSONにあるGraph/Claimリンクは既存URL契約への参照であり、画面での往復を実装・実ブラウザ受入したという意味ではない。閲覧処理はVPS上の検査済み静的artifactだけを読み、PC停止中も最後の結果を表示する。最終実行時刻と完了／保留／失敗／結果不明、`liveStatus=not-monitored`を区別する。研究室UIの実装時に日英・狭幅・Graph復帰・根拠閲覧を一緒に検証する。隔離確認port候補は3286（今回未bind）。

## 追加学習の独立入口

`training-plan` は新しい専用directoryにplanだけを生成し、GPU・torch・trainerを起動しない。共有runtimeで稼働しているtorch 2.8.0+cu126、transformers 5.19.0、peft 0.21.2、accelerate 1.15.0と固定KevのCLI引数を読み取り確認した。独立学習runtimeはまだ作っていない。共有image/cacheへの依存更新やmodel差替えはしない。

数ステップ試験案は0.8B、FP32、batch/accum=1、checkpointing、optimizer 3 step、総入力256 tokenを別途検査、state上限128、wall 180秒、RAM 6GiB、追加VRAM 2GiB、出力512MiB。開始70℃未満・80℃で自分の学習子processだけ停止。予算値は停止側の案であり、この上限で動く見込みの保証ではない。特に0.8B FP32の重み自体が約3GiBを使うため、共有モデルとの併存で追加VRAM 2GiBには収まらない可能性が高く、現条件では学習不可扱いを維持する。

固定base/初期checkpointをread-only、別output/cache、ネットワークなし、credentialなしの独立runtimeを準備してから、forwardだけでなくbackward/optimizer/checkpoint保存/再読込を測る。旧4B `session.py`、共有サービスのstop/restore処理は使わない。失敗/OOM/温度停止も候補版の記録として保持。クラウドは予算0・送信許可なしで実行しない。

ローカルの古い学習メモの「4GBあれば足りる」「bf16」例は今回の実機結論として採用しない。固定[Kev trainer](https://github.com/jaredpalmer/kev/blob/5e42a7a03f28134853dd3ff77461457e921e5ec1/kev/train.py)の引数を優先する。[PEFT量子化学習](https://huggingface.co/docs/peft/en/developer_guides/quantization)は量子化baseに追加パラメータを学習する手順、[bitsandbytes互換表](https://huggingface.co/docs/bitsandbytes/en/installation)は機能別のGPU対応を示すが、今回のKev pointer head・Pascal・逆伝播の成功を保証しない。NF4/FP16の後続案は固定wheelと実機試験が必要。

## 残る受入点

代表課題・採点案の人間確認、低温時の単回実推論と失敗観測、独立学習環境と資源上限の採用、実Home/Graphからの観察画面・戻り・履歴比較、公開artifact配信の資格情報分離と初回公開承認。本線参加・自動投稿・KG書込・権限昇格は別の段階で判断する。
