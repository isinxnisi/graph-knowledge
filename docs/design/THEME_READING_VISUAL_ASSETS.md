# テーマ導入の挿絵

2026-11-10。βで比較する制作物。デザインの採用・本番公開を意味しない。

## Webb editorial v1

- 保存先：`public/theme-assets/webb-editorial-v1.png`、768×512、透過PNG、約91KB。
- 制作：Plunode用にimagegenの組込みツールで新規生成。元のNASA写真は削除しない。
- 用途：読む入口の挿絵。Webbの金色の鏡・遮熱膜をモチーフにしたイラストであり、観測画像・技術図・設計資料ではない。科学的根拠として使わない。
- alt、caption、credit、制作記録URL、確認日は、テーマID・構成版・言語を固定した表示manifestに保存する。原本・翻訳・資料の版は変更しない。
- 画像と導入は共通の編集資産から取るが、中央の読書導入、TOPの紹介カード、OG画像はそれぞれの面積と役割に合わせて構図を変える。中央の画像リンク欄をそのままTOPへ複製しない。
- 読書導入：透過した挿絵を暖かい地に溶け込ませ、短い問いと導入文を主役にする。クレジットで画像を横断する帯や独立した写真枠は置かない。
- 出典・制作の情報は「このテーマについて」→「挿絵について」へ。画像破損・未登録時も本文と詳細入口を残す。

生成プロンプト（組込みimagegen、透過指定）：

> Use case: illustration-story. Asset type: editorial website illustration for an astronomy theme introduction; a small refined spot illustration, no text. Create an original hand-drawn illustration of the James Webb Space Telescope, recognizable golden segmented hexagonal mirror with its black three support struts and a delicate silvery layered sunshield underneath, floating in space with just a few tiny star and faint galaxy marks. The telescope is a poetic editorial subject, not a technical diagram or a photographic cutout. Style: exceptionally fine blue-grey ink contours, soft muted champagne-gold watercolor on the mirror, subtle warm taupe washes, airy and restrained like the opening illustration of a beautiful science essay. Attractive silhouette, light details, no heavy outlines. Landscape 3:2 composition with generous open negative space and softly fading edges. Transparent background, no panel, no border, no drop shadow, no labels, no logo, no title, no watermark. Calm luminous palette to blend with an ivory Plunode reading page. Make the whole telescope visible and legible when displayed at 190 by 125 pixels. Do not draw a classic tube telescope, people, planets, a spacecraft scene, or a busy star field. This is an illustrative interpretation, not documentary scientific evidence.

生成された元PNGは利用者の`.codex/generated_images`に保持。実装資材は既存sharpでサイズ・圧縮のみ変換した。

## PLUTO editorial v1（利用者提供、2026-11-12）

- `public/theme-assets/pluto-editorial-v1.jpg`、1600×900 JPEG、566,699 bytes。提供PNG1672×941／3,224,150 bytesを縦横比を保って軽量化。新規生成・切抜き・注釈焼込みは行わない。
- 漫画原稿・アトムのモチーフと刑事ロボットを描いたテーマの挿絵。利用者がテーマ用と指定した素材で、商品写真へ流用しない。creditは「テーマ挿絵：利用者提供」。存在しない外部出典URLやAI生成という由来は補わない。
- 同テーマのreadingBaseRevision4に紐づく共通導入・紹介・OGで利用。商品は別の利用者提供表紙をproduct-photoとして画像ID保存し、商品2版／テーマ6版へ接続する。旧商品1版は変更しない。
- 共通schemaではillustrationのsourceUrl／termsUrlを任意にし、photoは両方必須のまま。不正URLは拒否。実測はPLUTOテーマβ登録の画像追補を参照。
