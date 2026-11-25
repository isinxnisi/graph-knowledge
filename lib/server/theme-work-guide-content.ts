import type {WorkGuideContent} from '../domain/theme-work-guide';

export const initialWorkGuide:WorkGuideContent = {
 required:{
  principles:'年表を最初から最後まで読むだけで、題材固有の変化・転換・発見が伝わる作品にする。題名・導入・関係図・Story・詳細・画像・商品はその体験を深める。事実と日時を根拠で支え、権利・来歴・必要な日英訳・版・実表示をそれぞれ確認する。技術的な反映と作品品質は別に評価する。具体的な手段と改善価値がある重要作業を進める。作品が成立する場合は、追加画像・書影・購入先などの未対応を理由・影響・再対応条件とともに保存し、独立見直しへ進む。必須条件を現時点で満たせない案件は、原稿と理由を保持して非公開で退避し、次の制作へ進む。件数・作業回数のノルマは置かない。',
  'whole-theme-review':'別の独立見直し起動で、まず年表を単体で通読し、題名と導入が約束する重要な転換・発見を判断する。次に文章・画像・関係図・Story・詳細・商品が読者の理解を深めるか、最後に根拠・権利・日英訳・反映版・現行の実画面と導線を確認する。すべての必須条件が成立した場合だけ合格。修正後は最新の全体を読む。未反映の受付と必須の未確認は評価前に照合し、公開前に対処する。公開を妨げない未対応は後日対応へ記録する。必須条件が成立せず回復手段もない場合は、非公開で退避する。公開後は各公開言語の正規URLと提供版を確認する。',
 },
 sections:[
  {key:'timeline-and-sources',focuses:['planning','timeline','sources'],markdown:'読者が何を知りたくなり、読み終えると何が分かるかを定める。既存テーマとの差を確認し、重要な節目とその前後を組み立てる。事実に資料名・位置・確認した原文を対応させ、時点・継続期間・不確かな時期の幅を区別する。見出しは日付・対象・出来事を自然に理解できるようにし、日時だけの行や重要な展開の欠落を直す。'},
  {key:'reading-experience',focuses:['reading'],markdown:'題名・導入のフック・本文に役割を持たせ、題材に合う語順と文型を選ぶ。既存題名の型や記号の反復も点検する。年表を通読して見出しと段落の連続性を見る。関係図は具体的な役割と初見で分かる対象説明を持ち、Storyと詳細は年表から背景・根拠へ進める。商品と出典の役割を区別し、同じ説明を重ねない。'},
  {key:'images',focuses:['images'],markdown:'まず年表を通読し、読者にとって視覚化する価値がある場面と見せたい意味を決める。利用条件を確認した写真・図版、象徴的な視覚イメージの特徴を尊重した独自のカラースケッチやオマージュ、図解、画像なしから場面に応じて選ぶ。参照元・範囲・独自表現・来歴を確かめ、画風変更だけで利用可と判断しない。生成は原則3:2。画像内は短い固有名・関係程度にし、実物と創作の区別、日英alt、説明と適切な公開クレジットは画像外に置く。既存imageIdと生成受付を先に確認し、結果不明時の再生成を避ける。利用条件が確認できない素材、未確認の購入先は掲載対象から外す。読者体験が成立する場合は後日対応として記録する。'},
  {key:'registration-and-translation',focuses:['registration','translation','images','recovery'],markdown:'正確な参照版を読み、原文・訳文・Story・出典・画像・商品を保持する。prepare → dispatchで保存済みの送信を使う。結果不明なら既存受付・保存wireを照合し、別の送信を重ねない。反映と日英各対象版を読み戻す。後発公開との競合では旧公開版・現公開版・制作版の差を照合し、現在の公開revisionとreleaseIdでreconcilePublishedする。'},
  {key:'review-and-publication',focuses:['preview','handoff','review','publication'],markdown:'制作は作業版・日英訳・素材を読み戻し、見直しで視認する箇所を引き継ぐ。独立見直しは日英の対象言語でPCとスマートフォンのPNGを実際に視認し、画像・年表・詳細・Story・出典と戻る導線を確認する。未視認の受付は合格根拠にしない。最新の全体評価と有効なleaseによってcompleteし、公開後の正規URL・提供版・canonical等を確認する。公開待ちの再送は返却されたretryCommandをそのまま使う。'},
 ],
 assistance:[],
 evidence:{requiredLocales:[],requiredScreens:[]},
};

export const workGuideSafety = {
 planning:'接続先のApp・environment・originを確認する。正常な案件なしと接続失敗を区別する。scheduledの作成前に現在案件・重複を再確認する。',
 production:'scheduledとmanualを分け、実phase・現行版・有効なleaseを照合する。登録はprepare → dispatchから行い、受付を一般公開とみなさない。制作は認証済みPNGを採取せず、読戻しと確認箇所をhandoffする。期限前にrenewし、中断・退避前にチェックポイントを保存してreleaseする。未決受付は元案件で結果と回復方法を照合する。',
 review:'制作と別のexecutionIdでreviewをclaimする。現行lease・対象版・保存済み受付・公開競合を照合する。現行の全体評価と実画面証拠でcompleteする。制作原稿に通常公開経路を使わない。完了後の提供版は別途確認する。',
};
