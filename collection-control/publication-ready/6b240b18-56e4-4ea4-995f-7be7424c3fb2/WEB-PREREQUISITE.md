# 映画公開前のWeb切替が必要

本番Webは旧8 Role版のため、このnonceの署名前に新Webを配置する。個別公開署名とWeb切替の一括操作・固定hashは https://github.com/isinxnisi/graph-knowledge/blob/main/docs/research/film-release-20261027/PUBLICATION_APPROVAL_REVIEW.md を確認する。汎用READMEの直接署名コマンドはWeb互換性確認後の入口であり、今回は上記の一括操作を使う。元のimmutable announcementは保持する。新しい署名機構は導入しない。
