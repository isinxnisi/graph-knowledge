# 暗号化保管段階の停止と再開入口

運営者が固定VPS bootstrapを2回実行し、両方が operator-encrypted-custody / ValueError で停止した。保全先は /root/plunode-publication-readiness.83cftmbu と /root/plunode-publication-readiness.5ih89_06。applyCalls=0、activationAuthorized=false。元installerはこの後にimage load・固定program置換・audit token保存を行うため、それらへ進んだとは扱わない。非root SSHでもreadiness directoryなしを確認した。

最初はphraseの確認入力が表示されておらず、文字数条件の不一致が示唆される。2回目は確認入力まで進んだが、元helperが確認不一致・GPG失敗・agent cleanup失敗を同じValueErrorへまとめていたため、原因を断定できない。秘密値を求めず、元の実装の診断不足として修正する。

VPSの実GPG 2.4.4で、短い/長い一時homedirのダミー暗号化とprivate agent停止に成功。さらに元固定helperそのものをbundleからSHA照合してメモリへ読み、ダミーarchiveの暗号化・復号一致・一時agent停止に成功した。実鍵・DB・root設定は使用していない。この非root診断を実鍵backupの成功とは数えない。

新入口 ops/resume-publication-readiness-custody.py は上記2 stageだけを対象とし、root所有/非書換・元installer/helperの固定SHA・source9b59669を照合する。custody/rollback/credential/previousが存在したら無条件再開しない。production=false、新manifest/probe/sudo未配置も確認。2回目の既存stageをそのまま用い、旧installerの全asset/image/旧コード/base検査を再利用する。固定program/image/trustの内容は変更しない。

phrase入力だけは、長さと確認不一致を値を出さずに表示し、最大3回までその場で修正可能にする。GPGの暗号化/復号失敗には秘密を含まない段階ラベルを付ける。旧stage、旧証跡、予約、receiptは消さない。前回のPATは設定前にprocessが終了しており、保存したtokenを使い回せるとは扱わず、同じPATを端末へ再入力してもらう。

入力の短さ→修正、不一致→修正、3回上限、暗号化/復号エラーの秘密非表示、非root事前拒否の5検証が成功。完了済みDB apply/復旧試験は再実施していない。

再開入口のSHA256: f1854f15900fb806f70299a5c810c596d4b8e7cf25311c94fb58a5c366ccc6d9
