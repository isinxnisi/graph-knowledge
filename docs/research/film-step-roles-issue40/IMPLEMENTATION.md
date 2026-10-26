# 段別Roleの最小実装
比較基準：main b34e9ebe9df23835226651adbbda072908c933ab。先行研究461cd1ca614e5bebefd8181eecb0e89661d4a616はmergeで保存資料・検証コードをそのまま継承した。

## 条件契約
RelationConditionのversion=1、other-worksのrevision=3を追加した。段はcanonical矢印ではなく経路の位置で指定する。

~~~json
{
  "version": 1,
  "type": "pattern",
  "pattern": { "id": "other-works", "revision": 3 },
  "polarity": "affirmed",
  "contributionRoles": null,
  "stepRoles": [["ACTING"], ["DIRECTING"]]
}
~~~

W0 ← P → W1という作品・人物・別作品の経路で、Claim A（P→W0）にstepRoles[0]、Claim B（P→W1）にstepRoles[1]を適用する。配列内OR・段間AND、nullはRole限定なし、[]は不成立。Claimのcanonical方向、肯否、独立性は保持する。上の映画Roleは隔離overlay内でのみ有効。通常checkoutでは既存8Roleを指定できる。

revision 1/2はstepRolesを拒否し、同じcontributionRolesを両段へ適用し続ける。revision 3は共通Roleとの同時指定を拒否。未知Role・未知revisionも拒否し、黙って条件を落とさない。条件キーは正規化した段別配列を含むため、左右交換・空集合・null・旧条件で異なる。

## 一貫する実行経路
| 層 | 変更と保全 |
| --- | --- |
| lib/domain/relation-conditions.ts | tuple長2・revision別制約・安定キー・段ごとのRole参照。段番号なしでrev3 Claimを単独認定しない |
| lib/server/relation-pattern-execution.ts | 存在判定、最初の証拠、GraphページすべてfirstRoles/secondRolesを使う。旧条件は両方に旧共通Roleを渡す |
| lib/domain/relation-patterns.ts | 証拠列の各Claimへ段別照合。誤方向、Role違い、否定、同一作品への閉路を拒否 |
| lib/domain/discovery-targets.ts | POST version2を再利用。rev3は作品起点のみ、名前は対象作品／中央人物。中央人物起点はrev2のまま |
| lib/server/pattern-graph.ts | rev3は順序付き作品起点クエリだけを使用。元Claim・revisionを再検証して復元 |
| lib/client/{pattern-graph,discovery-relation-navigation,saved-workspace}.ts | POST2・証拠付きURL・workspace3に新条件を保存。旧形式への縮退を拒否 |
| components/RelationFilter.tsx、DiscoveryConnections.tsx | 段別切替と二つのRole選択。通常8Roleで操作可能。自由探索へ切替時は段別制約解除を明示 |
| lib/i18n/relation-condition.ts | 起点作品側／別作品側を日英で表示。共通ORにまとめない |

Graphの可視Claimは、段別に検証済みの完全経路から選ぶ。段の情報を失った共通Claim filterへ戻さない。

対象候補の完全判定はLIMIT前。Graphは並列Claimの全組合せではなく人物・終点作品の組をページングし、各段の代表Claimを一つずつ保持する。先行研究の7本のClaim組合せと、このAPIの3つの端点組を同一の件数として比較しない。

人物起点で段順を決める設計、同一終点に対する複数人物AND、異種Predicate、作品分類、無制限の経路列挙は今回実装していない。旧GET、manga preset、rev1/2、刊行物scope、漫画collectorの意味は変更していない。
