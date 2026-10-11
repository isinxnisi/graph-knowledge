# 共通KG・公開準備

安定dataset `public-kg`、初回release `20261011-001`。人間受入済み漫画v2＋Event v1（科学v2を含む）から構成し、元UUID・限定・資料を維持する。架空demoは含まない。既存の凍結datasetは変更しない。

18 Entity / 27 Claim / 15 Source / 29 Citation / 16 ExternalIdentifier。入力版・hash・Claim由来は各releaseのmanifest。資料・原語・受入理由は元の版付き台帳を参照する。

[生成・適用契約と現在の制限](../../docs/design/PUBLIC_KG_RELEASES.md)。初回生成は `npm run public:prepare`、再検証は `npm run public:validate`。生成物だけを手修正して初回の受入入力との差を隠さない。
