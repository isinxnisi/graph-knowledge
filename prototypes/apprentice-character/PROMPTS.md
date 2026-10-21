# B′ 仮アセットの由来

後続のサイズ別比較で通常UI用・極小用を追加した。[現在の3画像とプロンプト](SIZE_PROMPTS.md)。以下は最初の単一画像生成の記録。

2026-10-22。組込 ImageGen を使用（CLI/API fallbackなし）。正式アセット未確定。

ユーザー提供ZIPの2ファイルが個別添付とbyte単位で一致することを確認し、references/へ原本保存。参考シートをそのままアバターにせず、新規の透過切り抜き1点を生成。生成後の画像加工なし。assets/bprime-study.png が使用画像。

生成原本: C:/Users/nishr/.codex/generated_images/01a15ec0-6d81-74c1-94e1-58614fd52dc8/exec-3ac327ed-ab36-4961-b6d9-49b9e422212d.png

参照: references/plunode_explorer_apprentice_Bprime_reference.png

## 実際のプロンプト

Use case: stylized-concept. Input image is a character reference sheet. Create ONE isolated transparent-background provisional UI avatar of the B-prime apprentice exploration AI depicted on the left of this sheet. Preserve its identity: soft pale cream-white rounded floating body, small pale blue side sensors, compact subdued navy oval face panel with exactly two simple fixed vertical cyan eyes, no mouth, no legs or arms. Above the body a gently curved connected antenna joins a small lavender-blue light sphere and a larger pastel blue/pink sphere, like graph nodes connected by an edge. Preserve the tilted antenna and soft friendly 2.5D silhouette. Clean simplified shading, restrained highlights, no metallic machinery, no heavy dark mask, no extra features. Square composition, entire body AND antenna visible, centered and filling about 90% of canvas, minimal empty margins. No text, no labels, no repeated characters, no sheet, no floor shadow, no ground, no background. Genuine transparent alpha. Static neutral expression. This is a study asset, not a final brand asset.

## 組み込み

ApprenticeAvatar は保存済みラボの aiId を呼出元から受け取る。公式AIの表示binding／アセットとは別にする。画像選択から新Identityやアカウントを作らない。128/96/64/48/24/20/16pxは全て同じ静止ラフ。16pxは縮小限界を比較する段階であり、専用デフォルメの採用ではない。微細な縁・色むらは生成ラフに残る。

既存 prepare.py が隔離runtimeへコピーする。/ai-lab#mentorship と /ai-apprentice-study で確認。実験記録・実績・DEMOコメントは維持する。D案は候補として保持、今回は対象外。接続アンテナは現時点の共通方針で、将来も変更不能な規約にはしない。
