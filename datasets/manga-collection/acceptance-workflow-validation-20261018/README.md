# 受入ワークフロー タスク2の隔離検証

実運用の承認を追加した記録ではない。r0003凍結成果・r0002既受入追加集合を使い、一時ディレクトリの模擬判断から実CLIを2回実行した。判断者はISOLATED TEST ONLY。全一時受入記録・releaseを終了時に削除した。公開apply・restore・VPS配置・会員DB変更は行わない。

- 今回の模擬選択は萩尾望都／ポーの一族／11人いる！の3 Entity・2 Claim・2 Source・2 Citation。通常候補の残り23 Claimは未選択。原語・Role・ISBN scopeは維持する。
- 公開base 20261014-credits-001にr0002既受入9 Claimと模擬選択2 Claimを統合し、16 Entity・11 Claim・9 Source・11 Citation・16 ExternalIdentifierの追加を提示。既存の未適用releaseを公開baseとみなしていない。
- 実public:validate成功。ローカル実public:planは追加63知識Node・60 Relationship、既存更新0。再実行でも日時・受入本文・release全ファイル不変、validate再利用、planは再取得。
- 各回plan前後と試験全体前後の公開snapshot・revision・全知識・外部ID UUID・receipt／identity／撤回履歴が一致。旧r0002／r0003の受入・収集成果・レビュー・releaseの全inventoryも一致。
- 代表経路は萩尾望都 → ポーの一族／11人いる！。各接続のUUID・AUTHORSHIP・ISBN scope・Citation／Sourceはreadonly-cli.jsonに保持。隔離試験における正式受入済み未適用の状態で、公開API／画面での実探索確認ではない。
- 実運用の既受入52 Entity・40 Claim・33 Source・41 Citationの追加集合も、新しいmergeで旧r0003統合releaseと全レコード一致することを確認した。

検証総括はverification.json、実コマンドの結果はreadonly-cli.json。Task2単体16件、既存収集・漫画61件、公開／Role24件。未承認・hash／scope／本文改変・依存／根拠欠落・UUID／外部ID／Source／Citation重複・base／revision競合・release ID衝突を拒否する。部分受入・同定のみ・validate／plan失敗再開・保存日時改変拒否・凍結出力先への拒否も含む。

受入済みr0003が将来の公開baseになった仮想状態でも、同じレコードを再追加せず再利用できることをファイルだけの試験で確認。実際の公開applyは実施しない。
