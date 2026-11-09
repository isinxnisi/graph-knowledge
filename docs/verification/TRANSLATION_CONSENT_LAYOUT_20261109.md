# 翻訳欄のチェックボックスとスマホ表示

2026-11-09。①原因確認・②局所修正／画面確認・③localhost／HTTPS β／正式反映の3工程。①・②・③を完了。localhost／HTTPS β／正式Webへ反映し、正式の390px／PC表示とチェック操作を確認した。

## 原因と変更範囲

Graph探索の親 `Explorer.module.css` の `.explorer input { width:100% }` が、翻訳下書き生成のチェックボックスにも適用されていた。`.consent input` はflex:noneだけを指定しており、入力が本文幅を占め、同意文が右端の数文字幅へ押し出された。翻訳欄はTheme／Entity／Record／Sourceで共用している。

同意labelは、固定1remのチェックボックスとminmax(0,1fr)の文章列を持つgridへ変更。inputに幅・高さ・paddingを明示し、本文をspanで受ける。項目と言語のselectにもmin-width:0と親labelの最大幅を与える。操作・同意内容・外部送信・AI要求・認証・データ構造は変更しない。追加のテスト専用公開データやAI要求は作らない。

## 検証と配置

対象tsxのlintとdiff検査に成功。小さな表示修正のため同形のunit testは追加せず、型検査を含むbuildと、実ブラウザのPC／390px／320px・日本語／英語・チェック操作で確認する。配置と確認の実測は後で追記する。


## 実測・反映状態

- app `9d39f7d29f70d1ed4efd1da7b0f904c06263335e`。β build `kmG5WncQ4B_AyPgirQCqe`、正式候補 `f-Ryn5yWRD-CNjoPfInPS`。両buildの型検査に成功。追加unit／AI試行は行っていない。
- 実Googleログインの正式旧版・390pxで、checkbox幅301.22px／同意label高さ570.94pxの崩れを再現。HTTPS βの修正版・390pxではcheckbox16px、文章幅288.03px、label40.78pxになった。320pxの日本語では文章幅208.03px／高さ40.78px、英語では高さ61.17px。通常PC幅1920pxの狭い右ペインでもcheckbox16px／label40.78px。横へのはみ出しなし。
- checkboxをチェックすると下書き生成ボタンが有効、解除で無効になること、翻訳項目・言語の切替を確認。実AIの依頼ボタンは押していない。確認はデスクトップChromeのviewport指定であり、実機iPhone／iOS WebKitでの操作は未確認。
- mainへ通常反映し、3200／HTTPS βで上記を確認。14 private設定・会員39／知識8 migration checksum・既存Worker PIDを保持。Webだけを再起動。画面記録：`C:/Users/nishr/.codex/tmp/translation-consent-beta-390-20261109.png`。
- 正式候補 image `plunode-web:translation-consent-9d39f7d2`、manifest `sha256:c34b30b2108df60a711c44ca9ad1956f63390e0230f0d759dc09e36223b12519`。archiveのconfig／layer／source照合、VPS転送hash・runner --checkに成功。切替helperは既存のWeb-only手順を引き継ぎ、a9f2deaa／build XLE-FT07_ebW1CI2ERHw7、private設定、会員39／知識9 checksumと稼働サービスを再照合してWebだけを更新する。DB／Worker／KG／OSは更新しない。
- 本番はまだa9f2deaaの旧表示。既存sudoは本人入力が必要なため、PowerShellで `wsl -d Ubuntu -- python3 /home/isinxnisi/1.projects/7.graph-knowledge/backups/translation-consent-20261109/run-release.py`。実行後の正式確認と完了記録を残す。


## 正式反映・画面確認を完了

- 本人のsudo実行後、正式app `9d39f7d2`／build `f-Ryn5yWRD-CNjoPfInPS`とHTTP200を確認。Web manifestは上記と一致し、Webだけ更新。会員39／知識9のmigration、Worker・設定・KG・AI artifactは不変。DB復元は行っていない。
- 設定backup：`/opt/graph-knowledge/backups/translation-consent-web-20261109T094700Z`。activated.jsonとHTTP／画面計測をPCのignored `backups/translation-consent-20261109/`へ保存した。
- 実Googleログインの正式Theme構成版6を390pxで開き、年表見出しの翻訳欄を確認。checkbox幅16px／文章幅278.03px／label高さ40.78pxで、修正前の幅301.22px／高さ570.94pxの崩れは解消。横へのはみ出しなし。チェックで生成ボタン有効、解除で無効になる。PC幅1920pxでも幅16px／高さ40.78pxを確認し、viewport指定を解除した。
- 正式画面記録：`C:/Users/nishr/.codex/tmp/translation-consent-formal-390-20261109.png`。実機iPhoneの確認は行っていない。
- 同じ欄では、修正前から「翻訳依頼を確認できません。」のstatus取得エラーが表示されることも確認した。今回変更したCSS／markupによるエラーとは区別して記録する。原因調査・実AI要求は今回行わず、下書き生成の成功を確認したとは報告しない。チェック操作と表示崩れの修正は完了。
