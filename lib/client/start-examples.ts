import type { EntitySummary } from "../domain/api";
import type { DatasetMode } from "../domain/dataset";

// 凍結datasetの固定入口。条件・順位・推薦情報は含めない。
export const START_EXAMPLES: Record<DatasetMode, EntitySummary[]> = {
  "demo": [
    {
      "id": "c286065c-6e17-47a7-9288-2a1cf6919ce9",
      "kind": "person",
      "name": "青葉ハル",
      "description": "漫画家、星の航路の作者"
    },
    {
      "id": "8eb728de-a5fc-4adc-960c-2412fa9c91b7",
      "kind": "work",
      "name": "星の航路",
      "description": "架空漫画"
    },
    {
      "id": "af3c9bae-96c4-4a1f-93fe-5d1a6e79cac5",
      "kind": "organization",
      "name": "青空出版",
      "description": "架空出版社"
    },
    {
      "id": "869501dc-2ec0-4b5d-8e87-ff7a485cbe5a",
      "kind": "person",
      "name": "佐藤アキ",
      "description": "漫画家"
    },
    {
      "id": "b025d50b-5d7b-4f8f-a5dd-09f003781bf8",
      "kind": "person",
      "name": "佐藤アキ",
      "description": "編集者、同名の漫画家とは別人"
    }
  ],
  "pilot-urasawa-v1": [
    {
      "id": "d900543a-9c11-48c1-be76-1822b756fcc4",
      "kind": "person",
      "name": "浦沢直樹",
      "description": "漫画家。今回の収録作品：PLUTO、MASTERキートン、BILLY BAT。"
    },
    {
      "id": "29e9caea-6c44-4c1f-9abc-f4350003ca3b",
      "kind": "person",
      "name": "長崎尚志",
      "description": "PLUTOのプロデュース、MASTERキートンの脚本、BILLY BATのストーリー共同制作。"
    },
    {
      "id": "2b7c6289-d050-4dc0-93e3-9307681253cc",
      "kind": "work",
      "name": "PLUTO",
      "description": "漫画作品。根拠は小学館の第1巻商品情報。アニメ版とは別。"
    },
    {
      "id": "e87a40f9-3139-47a1-a962-6610eb2b8878",
      "kind": "work",
      "name": "MASTERキートン",
      "description": "漫画作品。根拠は完全版第1巻のクレジット。続編・アニメとは別。"
    }
  ],
  "pilot-urasawa-v2": [
    {
      "id": "d900543a-9c11-48c1-be76-1822b756fcc4",
      "kind": "person",
      "name": "浦沢直樹",
      "description": "漫画家。今回の収録作品：PLUTO、MASTERキートン、BILLY BAT。"
    },
    {
      "id": "29e9caea-6c44-4c1f-9abc-f4350003ca3b",
      "kind": "person",
      "name": "長崎尚志",
      "description": "PLUTOのプロデュース、MASTERキートンの脚本、BILLY BATのストーリー共同制作。"
    },
    {
      "id": "2b7c6289-d050-4dc0-93e3-9307681253cc",
      "kind": "work",
      "name": "PLUTO",
      "description": "漫画作品。根拠は小学館の第1巻商品情報。アニメ版とは別。"
    },
    {
      "id": "e87a40f9-3139-47a1-a962-6610eb2b8878",
      "kind": "work",
      "name": "MASTERキートン",
      "description": "漫画作品。根拠は完全版第1巻のクレジット。続編・アニメとは別。"
    }
  ],
  "pilot-science-v1": [
    {
      "id": "a1af9abb-843a-4611-853c-50f630b817ae",
      "kind": "organization",
      "name": "ゲッティンゲン大学",
      "description": "ドイツの大学。都市や同市の別研究所とは区別する。"
    },
    {
      "id": "8e322435-4318-4ad0-835b-3f71d2537421",
      "kind": "organization",
      "name": "ニールス・ボーア研究所",
      "description": "コペンハーゲン大学の研究所。旧理論物理学研究所を1965年改称。現在名で表示。"
    },
    {
      "id": "1530af15-129d-40bf-a1ca-ce8343dc7491",
      "kind": "person",
      "name": "ヴェルナー・ハイゼンベルク",
      "description": "理論物理学者。大学での早期経歴と研究所への訪問を収録。"
    },
    {
      "id": "5cda395a-4927-4cae-92fe-839b29d05095",
      "kind": "person",
      "name": "ポール・ディラック",
      "description": "理論物理学者。研究所への訪問とケンブリッジ大学の教授経歴を収録。"
    }
  ],
  "pilot-science-v2": [
    {
      "id": "a1af9abb-843a-4611-853c-50f630b817ae",
      "kind": "organization",
      "name": "ゲッティンゲン大学",
      "description": "ドイツの大学。都市や同市の別研究所とは区別する。"
    },
    {
      "id": "8e322435-4318-4ad0-835b-3f71d2537421",
      "kind": "organization",
      "name": "ニールス・ボーア研究所",
      "description": "コペンハーゲン大学の研究所。旧理論物理学研究所を1965年改称。現在名で表示。"
    },
    {
      "id": "1530af15-129d-40bf-a1ca-ce8343dc7491",
      "kind": "person",
      "name": "ヴェルナー・ハイゼンベルク",
      "description": "理論物理学者。大学での早期経歴と研究所への訪問を収録。"
    },
    {
      "id": "5cda395a-4927-4cae-92fe-839b29d05095",
      "kind": "person",
      "name": "ポール・ディラック",
      "description": "理論物理学者。研究所への訪問とケンブリッジ大学の教授経歴を収録。"
    }
  ]
};
