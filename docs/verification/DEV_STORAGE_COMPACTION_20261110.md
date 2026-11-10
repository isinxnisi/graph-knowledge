# 開発PCの不要物整理とWSL／Docker圧縮（2026-11-10）

①調査・②不要物整理を実施。③オフライン圧縮・再起動後の確認は管理者コマンドの実行待ち。本番VPS・アプリsource／build・DB形式は変更しない。

## 削除したもの

- 再生成できるNext.js cache 83か所、16.27 GiB。main・登録済みworktree・Plunodeの一時build配下だけを対象に、実パスと親ディレクトリを検査した。ソース・実行用build・依存・検証画像・backupは保持。
- 旧収集Workerの `control.git/objects/pack/tmp_pack_*` 7,882ファイル、62.70 GiB。Gitがgarbageと判定した、5分以上更新されていない一時packだけを既存Worker lock取得中に削除。indexed packやrefsは削除しない。
- Docker `desktop-linux` の未使用build cache。`docker builder prune --all --force` の報告値56.42 GB、終了後のbuild cacheは0件／0 B。image 353件・container 21件・volume 61件を保持した。volume prune・container prune・image pruneは行っていない。

上記はLinux内の使用量・Dockerの報告値で、Cドライブの物理回収量ではない。Ubuntuは163→84 GiB使用。Windows側のVHDはUbuntu約169.7 GiB、Docker data約91.9 GiBを占有し、管理者による圧縮を残す。trimが表示した907.7／174.5 GiBは仮想ディスク内の通知範囲であり、物理回収量として加算しない。

## Dockerエラーと旧Workerのキャッシュ

Docker Desktopはsettings-store.jsonへのrenameでAccess deniedを表示していた。file／親ACL・readonly・排他readを確認し、settingsをWindows側private領域へbackupして通常停止・再起動したところ、engine 28.5.1と既存12 containerが復帰した。初期化・ACL書換えはしておらず、一時的な拒否の具体的原因は断定していない。

旧Workerの取得用bare Gitには、整理前から空のobject 21件と壊れたrefがあった。再試行の一時pack増加を確認したため、既存Worker lock中に同じ既存remoteのcontrol／mainだけを別bare cacheへfetchした。Git connectivityと既存control-headのancestorを確認後、cacheだけを交換した。旧cacheは233 MiBのまま `control-corrupt-preserved-20261110.git` へ退避。収集済みデータ・runtime・config・control-head・Workerコードは保持した。復旧cacheのconnectivityは成功。

## 管理者による圧縮

実行資材は `scripts/compact-dev-storage.ps1`。WSL内から実行すると停止後にログ先へ書けないため、Windows側へ置いた同一内容のファイルを使う。

管理者として開いたPowerShellで：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\nishr\.codex\tmp\plunode-storage-20261110\Compact-PlunodeDisks.ps1"
```

このPCの実物で確認したUbuntuのext4.vhdxとDockerのdocker_data.vhdxだけを対象にする。Dockerの小さいengine diskやUbuntu-24.04は対象外。全WSLが一時停止するため、共有Kevと別プロジェクトのローカルサービスも停止する。本番VPSには接続しない。

手順は、元のcontainer／volume状態を記録 → Plunodeの4 timerを一時停止（実行中の指定taskはStop-ScheduledTaskで停止）→ 稼働containerを通常停止 → 2 filesystemをtrim／sync → Docker通常停止／WSL shutdown → あらかじめ作った入力ファイルで直ちにDiskPart compact → Ubuntu／Docker再開 → 元の稼働container・既存β／PC Workerを復帰、timer状態を復元する。AutopilotのWindows有効／無効設定は変更しない。format・WSL unregister・factory reset・volume削除・zero fillは含めない。

途中失敗時もfinallyで復帰を試みる。初回はWorker終了待ち3分で止まったため、その待機を廃止した。指定した収集等のtask以外やAutopilotを停止しない。Docker通常停止が失敗した場合も強制停止へ進まない。DiskPartは実物パスのselect／compact／exitだけを生成し、エラーを成功扱いしない。

終了結果は同じWindowsフォルダの `compact-result.json` と `diskpart-compact.log` に残る。圧縮完了・実回収量・復帰完了は、この結果と後続確認前には確定しない。

## 実施済みの確認

- PowerShell parser成功。DiskPart入力がselect／compact／exitの3行になること、native引数の受け渡しを確認。管理者処理・DiskPart自体は未実行。
- localhost:3200が200、WindowsからHTTPS βが200。PythonのHTTPS要求はCloudflareで403だったため、HTTPS確認はWindowsの結果と区別した。
- 会員PG・共有Kev・resale DBはhealthy、既存12 containerが稼働。source／buildは36c244b4／JdHoCpoWRBOXmGG1awuilを維持。画面変更を伴わないため再buildしない。
- 不要物の一覧、旧cache退避、settings backup、container／volume baselineはprivate領域に保存。会員・KG・モデル・未完了worktree・既存production backupを削除していない。

## 圧縮後の残確認

VHDサイズとC空き、元のcontainer／volume／image、既存timer状態、DB／Kev、localhost3200／HTTPS β、正式側PC Workerの復帰を確認する。停止でAutopilot holdは失われるため、作業再開時に新しいholdを取得・reviewする。

## 初回実行の中断と再開手順の是正

本人の初回実行は2026-11-10 19:03〜19:06 JST。Plunode-CollectionWorkerの終了待ちで中断し、Docker／WSL停止・DiskPartには到達しなかった。Ubuntu 182,219,440,128 bytes／Docker 98,668,904,448 bytesは前後同じ。初回結果はWindows privateフォルダの `compact-result.json.first-attempt` に保持した。4 timerは元の有効状態へ戻っている。

Workerの実装は単発onceだが、1サイクルが3分以内に終わる保証はない。復帰用finallyが停止前の中断でもβ起動を要求したため、既存3200を「occupied」として重ねて失敗扱いした。確認時点ではWeb／containerは継続稼働しており、復帰処理の失敗表示とサービス停止を混同しない。

修正版では、4 taskの新規起動を一時停止して実行中の指定taskを停止する。DiskPartの5行（Ubuntu select／compact、Docker select／compact、exit）を先にWindowsへ作り、WSL shutdownの直後に1回のDiskPartへ渡す。間に3秒待機・WSLの再照会・パス確認・ファイル生成を挟まない。DiskPart自身が使用中のVHDを拒否する。圧縮終了前にWSLやDockerを再開しない。失敗時も実際に停止を試みた工程だけ復帰し、既存のβはPID・cwd・コマンドを照合して起動を重ねない。

`powershell.exe`（Windows PowerShell）で6項目を確認：稼働taskのdisable→stop、待機taskはdisableだけ、shutdown→DiskPartの順、shutdown失敗時はDiskPart未実行、停止前中断ではDocker／βを再起動しないこと、実際の稼働中βを所有者照合して保持すること。前5項目は副作用をmock、最後は実WSL境界の非破壊確認。管理者停止／DiskPart実処理は次の本人実行と後続確認を残す。
