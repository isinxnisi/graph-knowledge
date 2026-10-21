# コミュニティ：管理メニューとホームの階層修正

2026-10-22。iPhone画面レビューに基づく接続試作だけの修正。

- 管理サブメニュー：PCのflex-direction:columnが狭幅にも残り、align-self:startで幅も縮んでいた。スマホでは幅いっぱいの横一列、非折返し、下線による現在地へ変更。項目は「公開範囲／掲載／メンバー／安全管理」。長い言語・拡大時はメニュー内横スクロールとし、ページ全体を横へ広げない。PCの縦メニューは維持。
- ホーム：コピー「ここから広がる、小さな発見。」と英語装飾見出しを削除。「おすすめのCapsule」を15pxの簡潔なセクション見出しに変更。コミュニティ名25px、Capsule名18px（スマホ）と区別する。最近の会話も同じ項目見出しの規則。Graph導線・掲載内容・権限は不変。
- 本線C1、3200／beta、本番、DB、KG、AIは変更なし。生成版のpublic/studyのJS/CSSを更新し、3275／graph-comへ配信。Next bundleの変更がないため再buildやサーバー停止は不要。

検証：`node prototypes/community-connected/hierarchy.test.mjs`。日英×320/390/1440px、見出しの大小、旧コピー不存在、スマホ管理メニューの同一行と高さ、項目切替・現在地、ページ横はみ出しなしを確認。外部HTTPSとローカルを確認。iPhone実機は運営者提供画像を参照したが、修正後の実機操作は未実施。

[スマホホーム](assets/community-hierarchy/ja-390-home.png)／[スマホ管理](assets/community-hierarchy/ja-390-manage.png)／[英語320px管理](assets/community-hierarchy/en-320-manage.png)。
