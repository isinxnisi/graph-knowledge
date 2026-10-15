export const SUPPORT_URL = "https://buymeacoffee.com/plunode";
const ja = {
  link: "Plunodeを支援する", title: "Plunodeの開発を支える", eyebrow: "Support Plunode",
  introduction: "人物・作品・発見のつながりを、Graphで辿る。Plunodeは、好奇心のまま知識を探索できるサイトを育てています。",
  invitation: "この取り組みを応援したいと思っていただけたら、開発への支援をお寄せいただけます。",
  purpose: "支援が支えること",
  uses: [
    { title: "サーバーの運営", description: "いつでも知識を探索できる環境を維持するために。" },
    { title: "知識データの拡充", description: "出典を確かめながら、辿れる対象と関係を増やすために。" },
    { title: "探索・共有機能の開発", description: "発見を楽しみ、残し、共有する体験を育てるために。" },
  ],
  optional: "支援は任意です。支援の有無にかかわらず、Graph探索やCapsuleをご利用いただけます。",
  action: "Buy Me a Coffeeで支援する", external: "外部の支援・決済サイトを新しいタブで開きます。",
  payment: "支援金額の選択と決済はBuy Me a Coffeeで行います。Plunodeではカード情報を取得しません。",
  privacy: "プライバシー・外部送信について", footer: "サービスの案内",
};
const en: typeof ja = {
  link: "Support Plunode", title: "Help Plunode grow", eyebrow: "Support Plunode",
  introduction: "Follow connections between people, works and discoveries. We are building Plunode as a place to explore knowledge through a Graph, guided by curiosity.",
  invitation: "If you would like to support this work, you can contribute to its development.",
  purpose: "What your support helps with",
  uses: [
    { title: "Keeping the servers running", description: "Maintaining a place to explore knowledge whenever you like." },
    { title: "Growing the knowledge graph", description: "Adding more entities and relationships with sources you can check." },
    { title: "Developing exploration and sharing", description: "Improving how you discover, save and share connections." },
  ],
  optional: "Support is optional. Graph exploration and Capsules are available whether or not you contribute.",
  action: "Support on Buy Me a Coffee", external: "Opens an external support and payment website in a new tab.",
  payment: "Choose your contribution and complete payment on Buy Me a Coffee. Plunode does not collect your card details.",
  privacy: "Privacy & external data transmission", footer: "Site information",
};
export function supportLabels(locale = "ja") { return locale === "en" ? en : ja; }
