# さいしょの扉が、開かない。

1986年のファミコン版『ドラゴンクエスト』。最初の部屋で使う小さな窓と、宝箱の上に立ってカギを取る一幕から、冒険へ出る前に遊び方を覚える設計を描く。Plunode映像制作室を介さず、独立したRemotion作品として制作した。

[完成映像（日本語）](dragon-quest.ja.mp4) ／ [日本語字幕](dragon-quest.ja.srt)

## 出典と演出

- 当時の説明書は、Aでコマンドの窓を表示し、十字で選択してAで決定すること、「はなす」で相手の方向を指定することを説明する。窓を出したときも部屋が画面に残る点を、番組の絵で示した。[エニックス『ドラゴンクエスト』取扱説明書 pp.10–11](https://www.gamingalexandria.com/highquality/fc/Dragon%20Quest/Dragon%20Quest%20-%20Manual.pdf#page=12)
- 説明書には、宝箱の隣に立つと「とる」が効かず、同じマスで実行すること、扉のそばでカギを持って「とびら」を選ぶことが記載されている。動画では同じマスを、箱の上に小さな旅人が飛び乗る作画で表現した。[取扱説明書 pp.13–14](https://www.gamingalexandria.com/highquality/fc/Dragon%20Quest/Dragon%20Quest%20-%20Manual.pdf#page=15)
- 堀井雄二は、王さまの部屋でコマンドを試し、部屋を出る頃には遊び方が分かるようにしたと振り返っている。[電ファミニコゲーマーのインタビュー](https://news.denfaminicogamer.jp/interview/170927#i-3)
- 発売年とプラットフォーム。[ドラゴンクエスト公式](https://www.dragonquest.jp/about/) ／ [Plunode公開テーマ第28版](https://plunode.net/?ktheme=theme%3A1ab040a3a68b1e5666de0ba354fa484891d56e95d5e6bda3&krev=28)

王の部屋、旅人、茶の間、扉の先は番組用のイラスト。窓と動きは、同じ画に対してどんな選択が現れるかを見るために演出した。ゲーム画面・ゲーム内の音声や曲の素材は収録していない。共通の四音は [channel_sound.py](../channel_sound.py)、ナレーションは VOICEVOX の青山龍星（ノーマル）。戸を叩く音、宝箱、ラッチなどの音は合成。

## 再編集

`film.tsx` に画と動き、`script.json` に語りと読み、`public/timing.json` に実測字幕時刻がある。Node.js 22以降でプロジェクトのコピーを開いて実行する。WindowsのUNC上では、Windowsローカルの作業先にコピーしてレンダリングする。

```sh
npm ci
npm run render
```

語りと効果音の再生成に Python 3、NumPy、FFmpeg、VOICEVOX Engine を使う。同じリポジトリ内の直接制作版ゴダード回の音声合成関数を参照する。
