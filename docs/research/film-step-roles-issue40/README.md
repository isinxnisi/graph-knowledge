# Issue #40 洋画の段別Role探索
2026-10-26。独立branch codex/issue40-film-step-rolesで実装・検証。main比較基準はb34e9eb、先行Astra研究は461cd1c。正式採用・収集実行・知識受入・公開の完了記録ではない。

- [監督・出演Roleの意味契約案](ROLE_CONTRACT.md)／[全Role比較を含む定義](role-proposals.json)
- [schema→server→witness→Graph・保存の実装](IMPLEMENTATION.md)
- [映画収集・review・受入へ接続するファイル別変更](COLLECTION_CONNECTION.md)
- [保存資料から生成した小規模fixture](fixture.json)／[実DB結果](ISOLATED_RESULTS.json)
- [検証範囲と制約](VALIDATION.md)

## 得られた結果
保存済み10作品・124候補・照合済み81記録から、西部劇／ドラマの3作品、10 Entity、12監督・出演Claimを選んだ。新規収集は0。先行資料の候補・source review・検証結果はbyte単位で維持した。

「許されざる者 → 出演者 → その人が監督した別作品」は、Clint Eastwood経由の「ミリオンダラー・ベイビー」1経路。共通ACTING OR DIRECTINGを両段へ適用すると、Freemanの共演や「荒野の用心棒」も含む3つの人物・終点作品組になる。段を逆にした「監督 → 出演」ではEastwoodの別2作品が対象となり、同じRole集合でも問いが異なる。先行研究の共通OR「7本」は独立Claimの組合せ数であり、APIが返す端点組3件と区別する。

実Neo4jでHTTP handler、証拠の再照合、Claim/Citation読出し、URL引継ぎ、Graph状態の展開、保存、サーバー復元を通した。原役割表記の欠落はnullを維持し、source headingを個人クレジット全文に見せかけていない。公開環境で検索可能になったという意味ではない。

## 採用判断
1. DIRECTINGとACTINGの包含範囲、とくに共同／総監督・声／吹替・舞台の境界を意味審査する。
2. 作品単位null scopeで受け入れる条件を決め、cut／地域／言語限定の必要な記録は保留する。
3. 原役割語が未転記のS09/S10について、既存資料の限定的な補足確認を次の作業範囲に含めるか決める。
4. 映画専用adapter／recipeを少数作品で手動実証する。共通gateを変える場合の漫画側code hash・承認への影響を整理してから進める。
5. Role採用・映画候補の個別受入後に、段別検索を本線へ採用するか判断する。採用前の通常checkoutは既存8Roleのみ受理する。

## 再現
Node 24、既存依存、DockerのNeo4j 5.26.31-communityを使用する。

~~~sh
python3 docs/research/film-step-roles-issue40/build_fixture.py --check
npm test -- --maxWorkers=2
npm run typecheck
npm run lint
python3 scripts/test-film-step-roles.py
~~~

最後のコマンドは一時ソースコピーにだけ提案Roleを追加し、固有名・ランダム認証・loopbackの空きポートで使い捨てDBを作る。外部資料を取得せず、.envや本番接続を読み込まず、既存の稼働DB・7695の使用者を停止しない。結果はtest-results/film-step-roles.json。source copyとDBは終了時に削除する。正規catalog審査・本番ポート制限は変更しない。

共通コードの段別Roleは既存8Roleでも利用可能。映画Roleはこの隔離overlayに限り有効で、研究branchを通常起動するだけでは監督／出演の本線語彙登録や映画データ公開は行われない。
