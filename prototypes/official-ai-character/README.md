# 公式AI v0.2の静止比較

正式アセットではない。`assets/` は組込ImageGenによる透過PNGの比較ラフ。方針は [OFFICIAL_AI_CHARACTER.md](../../docs/design/OFFICIAL_AI_CHARACTER.md)、使用プロンプトと原本は [PROMPTS.md](PROMPTS.md)。

実PlunodeのHome・Graph・SiteHeaderをコピーする既存AIラボ確認環境だけへ追加する。本体のapp/components、コミュニティ側、3200、beta、VPSは変更しない。生成後の確認先は `http://127.0.0.1:3268/ai-character-study`。比較リンクは既存3268のHome／Graphへ戻る。

## 再生成

共通Autopilot holdを取得してtokenで確認する。既存の3268が起動中なら、`experiments/ai-lab/.runtime/observer.pid` と `/proc/PID/cmdline` で**このworktreeの `prototypes/ai-lab/run.mjs`**であることを確認してから終了し、ポートが空くまで待つ。他のサーバーを停止しない。

```sh
python3 prototypes/ai-lab/prepare.py --token TOKEN
cd experiments/ai-lab/.runtime/observer
GRAPH_DATASET=public-kg NEXT_TELEMETRY_DISABLED=1 /tmp/graph-knowledge-node/bin/node node_modules/next/dist/bin/next build --webpack
cd ../../../..
python3 prototypes/ai-lab/serve.py --token TOKEN
```

生成器は既存ラボ記録の検証も行うため、保存済みprivate runtimeを持つ現PCを前提とする。PNG生成を再実行する必要はない。`prepare.py` がこのディレクトリのTSX・CSS・候補PNGを生成先へコピーする。

## ブラウザ検証

```sh
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu /tmp/graph-knowledge-node/bin/node prototypes/official-ai-character/verify.mjs
LD_LIBRARY_PATH=/tmp/noir-browser-tools/libs/usr/lib/x86_64-linux-gnu /tmp/graph-knowledge-node/bin/node prototypes/ai-lab/navigation.test.mjs
```

前者は3テーマ×2幅で、3候補のHome／Graph表示、明暗切替、画像表示寸法、静止、比較開始／終了、ラボ個体との分離、書き込み・推論なしを検証する。画像は `/tmp/plunode-character-v02-20261022/` に保存する。後者は既存ラボ導線の回帰確認。

プレビューにはAI応答、投稿、学習、正式アセット登録のボタンはない。64pxの案内役と20pxのコメント配置例は明示した表示サンプルだけである。専用極小版・アニメーションは静止案の選定後に別比較する。

## 育成担当への再利用

OfficialAi.tsx.txt の OfficialAiAvatar は profile（128px=A）、regular（48〜96px=B）、comment（16〜24px=C）の型付き用途を提供する。ラボの実配置は128/48/20px。official-ai.ts.txt の一つの表示参照bindingを共用し、登録済みAIIdentityを偽造しない。LabMentorship の3例文は display-demo だけで、実投稿や実験記録ではない。既存PNGは無加工で使用する。

検証：AI_LAB_ORIGIN=https://graph-ailab.isinxnisi.com を付け、既存Chromium実行環境で prototypes/ai-lab/mentorship.test.mjs を実行する。
