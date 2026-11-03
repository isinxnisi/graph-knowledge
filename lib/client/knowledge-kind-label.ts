export function knowledgeKindLabel(kind:string,locale="ja"){
 const labels:Record<string,[string,string]>={person:["人物","Person"],work:["作品","Work"],organization:["組織","Organization"],place:["場所","Place"],event:["出来事","Event"],entity:["対象","Subject"]};
 return labels[kind]?.[locale==="en"?1:0]??kind;
}
