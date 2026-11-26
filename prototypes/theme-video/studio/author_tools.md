# 制作環境の手引き

必要になった項目から参照できます。

**絵と映像**　案件の中で静止画、作画コード、アニメーションを自由に制作できます。書き出した画は `view_image` で開けます。公開資料の図や写真を見たいときは `python3 fetch_reference.py <HTTPS URL>` を使えます。

**画像生成**　`image_gen__imagegen` が使えるセッションでは、生成した一枚を次のように案件に保存できます。同じ関数呼び出し内で画像を渡すと、編集に使えるファイルの相対パスが返ります。

```js
const image = await tools.image_gen__imagegen({prompt: "ここに描きたい一枚を書く"});
const saved = await tools.mcp__film__save_image({image_url: image.image_url});
text(saved.content);
```

**試写と書き出し**　`mcp__film__render` で React・Remotion・FFmpeg・FFprobe が使えます。その中の `/work` はこの案件フォルダです。Remotion のブラウザは `/opt/chromium/chrome-headless-shell`。一枚の静止画や一場面の動画も書き出せます。

**声**　`python3 say.py ja '実際に発音させたい読み'` または `python3 say.py en 'spoken line'` が番組音声のWAV、実測秒数、クレジット表記を返します。

**制作を分担したいとき**　`collaboration.spawn_agent`（`fork_turns="none"`）には問いと案件内のファイルを渡せます。たとえば作者が冒頭を編集する間に、実機写真と描きかけの画を添えて「ファミコンで遊んだ人が、見た瞬間にあの手触りを思い出せる一枚が欲しい。形は写真を、画風はこの試し絵を参考に。構図はお任せします」と頼めます。返ってきた素材を別名のままカットに置いて、採用するか決められます。
