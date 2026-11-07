export function knowledgeImportItemLabel(state:string,locale:string){
 const labels:Record<string,[string,string]>={
  queued:['確認待ち','Waiting for checks'],
  leased:['内容と根拠を確認中','Checking content and sources'],
  checking:['内容と根拠を確認中','Checking content and sources'],
  running:['内容と根拠を確認中','Checking content and sources'],
  retry:['接続待ち・自動で再試行','Waiting to retry automatically'],
  quota:['利用枠待ち・自動で再開','Waiting for allowance; resumes automatically'],
  applied:['公開へ反映中','Publishing'],
  published:['反映済み','Published'],
  existing:['登録済みの知識を利用','Existing knowledge reused'],
  'needs-changes':['補足が必要','More information needed'],
  declined:['公開できません','Not published'],
  cancelled:['取消済み','Cancelled'],
 };
 const label=labels[state]??['処理中','Processing'];return label[locale==='ja'?0:1];
}
