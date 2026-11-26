# キャベツ畑まで、2.5秒。

1926年のゴダードの初飛行から、日記に残った小さな可笑しさを描く日本語の横長動画。制作室を経由しない独立したRemotion作品。[完成映像（日本語・71秒）](goddard.ja.mp4)

入口ではキャベツを一株だけ大きく置く。農場の架台が見え、点火してもまだ動かない間をとる。飛翔の2秒半は声と字幕を止める。飛んだ後で距離を示し、日記を開いて機体の動きがゴダードとエスターにどう見えたかを聞く。最後にキャベツへ戻る。

## 原資料

- 日付、機体配置、飛行時間と距離、着地点は[NASAの初飛行解説](https://www.nasa.gov/history/95-years-ago-goddards-first-liquid-fueled-rocket/)に基づく。時計上の飛行時間を2.5秒とし、架台から着地点までの距離を約56メートルとした。
- 点火から浮上までの描写とエスターの見立ては[ゴダードの1926年3月17日の日記](https://commons.clarku.edu/goddardlaunch/31/)に基づく。「そろそろ、よそへ行きますね」は日記に記された見立ての趣旨訳。
- [クラーク大学の資料解説](https://commons.clarku.edu/goddardlaunch/24/)に、飛行前後の撮影と飛行がフィルムに収まらなかった事情が記されている。映像内の畑・機体・軌道・日記帳は作画、風や点火と着地の音は合成。作画の季節感、軌道の形、着地の姿勢は演出上の表現。
- [Plunode公開テーマ第16版](https://plunode.net/?ktheme=theme%3A7b5da1642151bf450340cef1bfa6bc21c24e72c04df97a2d&krev=16)

## 再編集

`art.tsx` は背景とキャベツ、`film.tsx` は機体・各場面と編集、`script.json` は字幕・読み・発話開始時刻。冒頭の4音は [channel_sound.py](../channel_sound.py) を使用。ナレーションは VOICEVOX 0.24.1 の青山龍星（ノーマル）。日本語フォントは Noto Sans JP と Noto Serif JP。

Node 22以降、npm、Python 3とNumPy、VOICEVOX Engineが利用できる端末でこのフォルダから実行する。WindowsのUNC上にソースがある場合、トラックを先に生成し、このフォルダの内容をWindowsローカルの作業先にコピーしてnpmとRemotionを実行できる。

```sh
python audio.py .
npm ci
npm run render
```

MP4は1920×1080、24 fps、71秒のH.264/AAC。音声の生成時に、焼き込み字幕に使う実測時刻と別配布用のSRTを出力する。
