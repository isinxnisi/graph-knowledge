export function knowledgeKindLabel(kind:string,locale="ja"){
 const labels:Record<string,[string,string]>={person:["人物","Person"],work:["作品","Work"],organization:["組織","Organization"],place:["場所","Place"],event:["出来事","Event"],entity:["対象","Subject"]};
 return labels[kind]?.[locale==="en"?1:0]??kind;
}

/** Reading labels group familiar kinds without changing the stored KG classification. */
export function knowledgeRelatedHeading(kinds: readonly string[], locale = "ja") {
 const groups: Record<string, [string, string]> = {
  person:["人物","people"], 人物:["人物","people"],
  organization:["組織","organizations"], 組織:["組織","organizations"],
  work:["作品","works"], 作品:["作品","works"],
  event:["出来事","events"], 出来事:["出来事","events"],
  place:["場所","places"], 場所:["場所","places"],
  equipment:["機器","equipment"], instrument:["機器","equipment"], rocket:["機器","equipment"], telescope:["機器","equipment"],
  ロケット:["機器","equipment"], 宇宙望遠鏡:["機器","equipment"], 望遠鏡:["機器","equipment"], 遮熱装置:["機器","equipment"],
 };
 const en = locale === "en", labels: string[] = [];
 let other = false;
 for (const kind of kinds) {
  const group = groups[kind];
  if (!group) { other = true; continue; }
  const label = group[en ? 1 : 0];
  if (!labels.includes(label)) labels.push(label);
 }
 const order=en?["people","organizations","works","events","places","equipment"]:["人物","組織","作品","出来事","場所","機器"];
 labels.sort((a,b)=>order.indexOf(a)-order.indexOf(b));
 if (!labels.length) return en ? "Related information" : "関連する情報";
 return en ? "Related " + new Intl.ListFormat("en",{style:"long",type:"conjunction"}).format([...labels,...(other?["more"]:[])]) : "関連する" + labels.join("・") + (other?"など":"");
}
