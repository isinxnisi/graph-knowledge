# 翻訳欄のチェックボックスとスマホ表示

2026-11-09。①原因確認・②局所修正／画面確認・③localhost／HTTPS β／正式反映の3工程。現在は①完了・②修正実装済みで、buildと実画面確認を進める。

## 原因と変更範囲

Graph探索の親 `Explorer.module.css` の `.explorer input { width:100% }` が、翻訳下書き生成のチェックボックスにも適用されていた。`.consent input` はflex:noneだけを指定しており、入力が本文幅を占め、同意文が右端の数文字幅へ押し出された。翻訳欄はTheme／Entity／Record／Sourceで共用している。

同意labelは、固定1remのチェックボックスとminmax(0,1fr)の文章列を持つgridへ変更。inputに幅・高さ・paddingを明示し、本文をspanで受ける。項目と言語のselectにもmin-width:0と親labelの最大幅を与える。操作・同意内容・外部送信・AI要求・認証・データ構造は変更しない。追加のテスト専用公開データやAI要求は作らない。

## 検証と配置

対象tsxのlintとdiff検査に成功。小さな表示修正のため同形のunit testは追加せず、型検査を含むbuildと、実ブラウザのPC／390px／320px・日本語／英語・チェック操作で確認する。配置と確認の実測は後で追記する。
