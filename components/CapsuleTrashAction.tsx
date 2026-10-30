"use client";
import {useState} from "react";
import {z} from "zod";
import {useUiLocale} from "../lib/client/ui-locale";
import {getMemberIdentitySnapshot} from "../lib/client/use-member-identity";
import {memberRequest,memberItemSchema,MemberClientError} from "../lib/client/member-api";
import {setBrowserCapsuleTrashed} from "../lib/client/capsule-store";
import {CapsuleError,type LocalCapsule} from "../lib/client/local-capsules";
import {CapsuleModal} from "./CapsuleSurface";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";
export default function CapsuleTrashAction({id,title,revision,ownerId,browser,trashed=false,onChanged}:{id:string;title:string;revision:number;ownerId?:string;browser?:LocalCapsule;trashed?:boolean;onChanged:()=>void}) {
 const {locale}=useUiLocale(),en=locale==="en";
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const label=trashed?(en?"Restore":"元に戻す"):(en?"Move to trash":"ごみ箱へ移動");
 async function perform(){
  const session=getMemberIdentitySnapshot();setBusy(true);setError(null);
  try{
   if(ownerId){
    if(session.status!=="authenticated"||session.user?.id!==ownerId)throw Error("identity");
    if(trashed)await memberRequest(`/api/member/capsules/${id}/restore`,memberItemSchema,{method:"POST",user:ownerId,body:{expectedRevision:revision}});
    else await memberRequest(`/api/member/capsules/${id}`,z.object({deleted:z.literal(true)}),{method:"DELETE",user:ownerId,body:{expectedRevision:revision}});
    const current=getMemberIdentitySnapshot();if(current.version!==session.version||current.user?.id!==ownerId)return;
   }else if(browser)await setBrowserCapsuleTrashed(browser,!trashed);
   setOpen(false);onChanged();
  }catch(cause){setError((cause instanceof MemberClientError&&cause.code==="CAPSULE_LIMIT"||cause instanceof CapsuleError&&cause.reason==="limit")?(en?"Your 20 active Capsules are full. Move another to trash first.":"保存枠20件が埋まっています。別のCapsuleをごみ箱へ移してから戻せます。"):(en?"Could not confirm the result. Refresh the list before retrying.":"結果を確認できませんでした。一覧を更新してから再試行してください。"));}
  finally{setBusy(false);}
 }
 return <><button title={label} aria-label={`${title}：${label}`} onClick={()=>{setError(null);setOpen(true);}}><Icon name={trashed?"undo":"trash"}/>{trashed&&label}</button>{open&&<CapsuleModal title={label} dismissible={!busy} onClose={()=>setOpen(false)}><p><strong>{title}</strong></p><p>{trashed?(en?"Return this Capsule to your list. Sharing stays stopped.":"一覧に戻します。停止した共有は自動では再開しません。"):(en?"You can restore this Capsule later. Shared links and community listings will stop; conversations are retained.":"あとから元に戻せます。限定リンクとコミュニティ掲載は停止します。会話は残ります。")}</p>{error&&<p role="alert">{error}</p>}<footer className={css.dialogFooter}><button disabled={busy} onClick={()=>setOpen(false)}>{en?"Cancel":"キャンセル"}</button><button data-variant="primary" disabled={busy} onClick={()=>void perform()}>{busy?(en?"Working…":"処理中…"):label}</button></footer></CapsuleModal>}</>;
}
