# 公式AI v0.2 比較画像の生成記録

2026-10-22。Codex組込 **ImageGen** を使用。すべて透明背景のPNG。Aを新規生成し、同じ輪郭・目を比較するためBはA、CはBを参照して編集生成した。ユーザー添付の現行画像はなく、文章の方針を基にした新しい比較案である。正式アセット、名称、アニメーション方式は未選定。

画像の加工・切り抜き・再着色は行っていない。UIでCSSによる表示サイズだけを変える。原本は `C:\Users\nishr\.codex\generated_images\01a15ec0-6d81-74c1-94e1-58614fd52dc8` に残し、候補をこのディレクトリの `assets/` へコピーした。

## A — v02-translucent.png

原本: `exec-13880929-ea8d-4bcb-b898-0235a9837efc.png`

Create one static character concept, isolated on a truly transparent background, no text, no sheet, no scenery, square canvas. Plunode official community guide AI, distinct from exploration apprentice AI. One friendly softly round sphere, facing front, centered with generous margins, body 65 percent of canvas. Two small simple solid black oval eyes fixed neutral expression; no mouth, no nose, no limbs, no eye glints. A single gently bending antenna-like graph branch rises diagonally from upper right of sphere, two visible short thin but readable curved connection lines connect three small round light nodes, largest at tip. Calm pastel blue, lavender and subtle pink. Style A: translucent soft 2.5D, restrained satin soft shading, slight inner light, substantially flatter than polished glass, NO hard specular glare, NO photoreal glass, NO metallic material. Distinct simple silhouette, eyes legible at tiny size, graph antenna connected not detached sparkles. No surrounding decorative particles, no ground shadow, no animation. Professional app mascot comparison candidate only; composition optimized for display at128px and20px.

## B — v02-soft-flat.png

原本: `exec-642841cd-10fe-46e2-b298-29b234ba46d7.png`

Edit this character into comparison Style B: soft flat illustration. Preserve the exact overall silhouette, antenna with three connected round nodes, placement and same fixed simple black oval eyes, no mouth. Calm pastel blue lavender pink. REMOVE glass highlights, inner translucent ribbons, rim glare, refraction and all specular material effects. Use a soft matte flat body with just one very gentle broad color gradient, flat light dots, simple clean curved connection strokes. Front facing static sphere. No added details, text, shadows, animation or scenery. Truly transparent background, same square composition. Professional friendly app mascot candidate readable at128px and20px, not final branding.

## C — v02-symbolic-flat.png

原本: `exec-5b10e606-725a-4ca2-abdf-4b77622f7732.png`

Edit this character into comparison Style C: symbolic flat app icon, like crisp simple vector geometry rendered as PNG. Preserve same soft circular body silhouette, placement, diagonal upper right antenna with three connected round nodes, fixed pair of black oval eyes, no mouth. Body a single solid pastel periwinkle blue (#ACB8ED approximately), nodes alternate solid lavender and pale pink, connector a clearly readable medium lavender uniform stroke. STRICTLY NO gradients, NO glass, NO shadows, NO glow, NO highlights, NO outlines around body, NO texture, NO internal shapes. Simple solid black eyes. Clean antialiased shapes with truly transparent background. Same square composition and margins as reference. Static conceptual mascot comparison candidate, not final branding. Optimize clear face sphere and connected antenna at20px.

## 出力の限界

プロンプトは生成指示であり、寸法や色の厳密保証ではない。Cも完全な単色ベクターではなく微細な色むらがある。3点とも生成由来の縁の残りがあるため、正式採用前に輪郭・小サイズ用造形を別途整える。128/64/48/20/18/16pxは余白込みの画像枠であり、球体直径ではない。
