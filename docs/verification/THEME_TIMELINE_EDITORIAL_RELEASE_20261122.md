# 年表編集契約の正式反映

2026-11-22 JST。 [Issue #77](https://github.com/isinxnisi/graph-knowledge/issues/77) の固定コミット `3f388eb5cd3134fa3bde8e5d70d4d9a079d26956` を正式反映した。β build は `9B12btk-yQeShc-MILeBg`、正式 build は `UxEm5YCPPjAvD5m9GGl4P`。年表の除外、読み戻し、見出しのフォールバックは[運営テーマ登録の契約](../design/KNOWLEDGE_CHATGPT_THEME_REGISTRATION.md)を参照する。

| サービス | 切替前のsource | 切替後のsource |
| --- | --- | --- |
| Web | `1ed7db46` | `3f388eb5` |
| `knowledge-review`（テーマ受付） | `0a94174d` | `3f388eb5` |
| `knowledge-publisher`、`knowledge-patrol` | `0a94174d` | `3f388eb5` |
| `theme-automation`（プレビュー採取） | `7a7efeaa` | `3f388eb5` |

共通公開手順を使い、WebとWorker 4本を同じビルドで起動して稼働確認した。旧Workerが新しい年表フィールドを拒否することを隔離確認し、先に旧Workerを停止した。会員50・知識13の移行台帳と環境設定のハッシュを照合し、今回の移行は0件。画像生成APIの既存設定も照合した。強制的な公開投影の作り直しは実行していない。

## 反映後の確認

- 認証済みの本番Appから `get_theme_authoring_guide` を読み、更新スキーマの `changes.timeline.excludedRecordIds` が配列として公開されていることを確認した。共有品質ガイドは第11版。
- `read_theme` の公開版を読み、ルート66第12版（15記録）とWebb第33版（33記録）の版番号・公開ID・記録数が切替前と一致した。両テーマの `timelineEditing` は年表の対象11件、除外0件。ルート66は作業版の読み取りでも同じ状態だった。
- 正式HTTPSでTOP、dataset、検索の1・2ページ、互換性APIのビルドを確認した。内部の切替確認では関係図と出典付き固定版も照合した。切替時の公開世代は `k75-c6026b1ec85ba89fce7ad50ca937e0c3`、外部確認時は `k75-22c91b8c6a2c58e78d913277e6081534`。
- Playwrightで2テーマの日英正規URLと1440px・390pxの計8条件を確認した。全条件で年表11行と最初の行からの出典導線が切替前と一致した。初回比較で英語版ルート66のスマートフォン表示を描画直後に判定して出典を拾えなかったため、表示完了を待つ検査で全8条件を再確認した。
- βでも再起動後の認証付きプレビューを日英・PC／スマートフォンの4条件で再検証した。共通公開手順の隔離試験は7件通過した。

## 復旧と引き継ぎ

- 退避先は `/opt/graph-knowledge/backups/release-3f388eb5cd31-8b39ca8bdf6c80ef`。旧Composeと切替状態を保存し、旧イメージの参照と存在を切替前に確認した。
- 切替中断時は退避先の `state.json` とroot専用の切替ログを確認する。新Web起動前の切替工程では共通手順による旧サービス復旧を使う。新Web起動後は新しい契約の書き込みを受け付け得るため、同じseal `8b39ca8bdf6c80ef13f4d108588d4dd39763ab9ca18e9c88e41b823ceb0c9a55` の資材を再適用して前進復旧する。詳細は[共通本番公開手順](../runbooks/PRODUCTION_RELEASE.md#失敗中断時)を参照する。
- ルート66の年表編集と独立見直しはChatGPT側の工程。正式反映の確認は本番Appと公開ページの読取で実施し、案件・定期実行設定・品質ガイドへの書込みは行っていない。

## 年表の記録画像を正式反映

2026-11-22 JST。年表と記録詳細に画像を表示する登録契約、枠線なしの7px角丸と左端の余白、画像から記録詳細を開く操作を、固定コミット `9a39541981e4f6f3679fc1a003c7aabe9dda8fa0` で正式反映した。β build は `R5l9_1ewj1cGlIWdNOJ8x`、正式 build は `t5qLsCpLkl9FGwOFmON7Q`。年表で画像または見出しを押すと詳細を開く。詳細の画像から拡大できる。 [年表の記録画像の登録契約](../design/KNOWLEDGE_CHATGPT_THEME_REGISTRATION.md#年表の記録画像)

- Web、`knowledge-publisher`、`knowledge-review`、`knowledge-patrol`、`theme-automation` の稼働版をそろえた。正式の会員50・知識13の台帳と環境設定を照合し、追加migrationは0件。画像生成APIの既存上限はUTCで1日30送信、1送信1枚。切替時の公開世代は `k75-004cf68ab4f101c81e41ba24f1c522e9`。
- 正式HTTPSのTOP・検索・互換性APIと、認証済みの `get_theme_authoring_guide` を確認した。作成・更新の `presentation[].records[].imageId` と制作受付の `generatedImage.target` を読み戻した。認証済み `read_theme` ではルート66第13版とWebb第34版の固定版、年表設定、スナップショット、表示情報が切替前と一致した。
- 既存公開テーマ2件の日英・1440px／390pxの計8条件で、年表の行数・表紙・詳細の出典を切替前後で照合した。初回の切替後検査では表示直後のクリックで詳細を拾えなかったため、選択状態の反映を待つ検査で8条件を再確認した。画像の登録から年表・詳細・拡大までの通し確認はβの非公開テーマで実施した。
- Codexで確認できる接続済み本番Appのツール定義は、切替後も `prepare_theme_production_submission.generatedImage` に `target` を含まなかった。記録への指定は既存の `command` 内の `presentation[].records[].imageId` でも行える。生成結果を `generatedImage.target` で直接指定する場合は、ChatGPT WebでAppのツール定義を更新し、同フィールドを読み戻してから使用する。定期実行設定と品質ガイドへの書込みは行っていない。

退避先は `/opt/graph-knowledge/backups/release-9a39541981e4-6b2ac9f477eab4d4`。退避したCompose・旧イメージ・`state.json` を復旧判断に使う。新Web起動後は新しい画像の紐付け契約を受け付けるため、同じseal `6b2ac9f477eab4d43fada2d53416ff23391462cff77efd182a63049043aee609` の資材で前進復旧する。 [共通本番公開手順](../runbooks/PRODUCTION_RELEASE.md#失敗中断時)

## 記録詳細の画像レイアウトを正式反映

2026-11-23 JST。固定コミット `4e9ea9dac29d5aeea5fdc45ac59ebcd3bc79d94d` のCSS修正を、Webのみの差し替えで正式反映した。β build は `2YhIu7BZkqtjP0ynP-x_L`、正式 build は `wq3tH5qGxsQwA53htv1em`。切替時に台帳（会員50、知識13）、Worker 4本と既存の環境設定の一致を確認した。追加migrationは0件。

- 正式HTTPSのTOP・dataset・検索・互換性APIを確認した。公開世代は切替前後で `k75-7a0743aeb940667b13430af82d43103a`。
- 本番の『Illmatic』で、日英・1440px／390pxの4条件を確認した。年表の画像から記録詳細を開き、詳細の画像とボタンが同じ幅で、外枠なし・中央揃えの角丸画像になった。拡大・クレジット表示・閉じる操作も確認した。
- 黒澤明のアカデミー名誉賞のイラストはβの確認用として保持した。正式の画像配信経路では当該画像がHTTP 404となることを確認した。

公開資材のsealは `47367ab257b47d607aedb4c9d5d540668e68341a33eae44fb8a7d10afc828a16`。退避先は `/opt/graph-knowledge/backups/release-4e9ea9dac29d-47367ab257b47d60`。復旧時は旧Composeと旧Webイメージを使い、共通公開手順のWebのみの復旧に従う。 [共通本番公開手順](../runbooks/PRODUCTION_RELEASE.md#失敗中断時)
