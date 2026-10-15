const ja = {
  home: "Home", eyebrow: "DISCOVER · PLUNODE", title: "ひとつの興味から、つながりの先へ。",
  introduction: "好きな作品から作者へ。ひとりの研究者から、別の時代へ。気になる対象を選んで、知識の地図を広げてみませんか。",
  featured: "ここから辿ってみる", featureTitle: "PLUTOから広がる、作者たちの世界",
  featureDescription: "作品に関わった人を辿ると、ほかの作品へ。制作の役割や資料を読みながら、その先のつながりを見つけられます。",
  explore: (name: string) => `${name}から探索する`, connected: "この作品につながる人物",
  fields: "興味のあるテーマから", science: "研究者と研究機関", event: "会議に集まった人々", manga: "作品をつくった人々",
  scienceDescription: "研究所を起点に、研究者の足跡を辿る。", eventDescription: "1927年のソルヴェイ会議から、参加者へ。", mangaDescription: "ひとりの制作者から、いくつもの作品へ。",
  recent: "最近加わった知識", entities: "対象", claims: "関係の記録", dateNote: "日付はPlunodeへの記録日です。同日の項目は記録順ではありません。",
  evidence: "資料と記録を読む", noRecent: "追加された知識は、ここに並びます。",
  searchTitle: "気になる名前はありますか？", search: "名前・別名で検索する", searchHint: "人物・作品・組織・出来事から探せます。",
  unavailable: "紹介する知識を読み込めませんでした。名前からの検索をお試しください。",
  knowledge: (entities: string, claims: string) => `${entities}の対象 · ${claims}の関係の記録`,
};
const en: typeof ja = {
  home: "Home", eyebrow: "DISCOVER · PLUNODE", title: "One curiosity. Many connections.",
  introduction: "From a favourite work to its creators. From a researcher to another era. Pick a starting point and see where the connections lead.",
  featured: "A place to begin", featureTitle: "The creators connected to PLUTO",
  featureDescription: "Follow the people behind a work to discover their other works. Explore creative roles and the sources behind each connection.",
  explore: name => `Explore from ${name}`, connected: "People connected to this work",
  fields: "Follow your interests", science: "Researchers & institutions", event: "People at a historic meeting", manga: "People behind the works",
  scienceDescription: "Trace researchers’ paths from an institute.", eventDescription: "Meet the participants of the 1927 Solvay conference.", mangaDescription: "From one creator to several works.",
  recent: "Recently added knowledge", entities: "Entities", claims: "Relationship records", dateNote: "Dates show when records were created in Plunode. Items on the same date are not ordered by time of entry.",
  evidence: "Read the record & sources", noRecent: "New knowledge will appear here.",
  searchTitle: "Have a name in mind?", search: "Search names & aliases", searchHint: "Find people, works, organisations and events.",
  unavailable: "We could not load the featured knowledge. Try searching by name.",
  knowledge: (entities, claims) => `${entities} entities · ${claims} relationship records`,
};
export const discoveryHomeLabels = (locale: string) => locale.startsWith("en") ? en : ja;
