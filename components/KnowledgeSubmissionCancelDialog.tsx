"use client";
import {CommunityDialog} from "./CommunityDialog";
import css from "./KnowledgeSubmissions.module.css";

export default function KnowledgeSubmissionCancelDialog({title,locale,busy,pending,error,onCancel,onConfirm}:{title:string;locale:string;busy:boolean;pending:boolean;error:string|null;onCancel:()=>void;onConfirm:()=>void}){
 const t=(ja:string,en:string)=>locale==="en"?en:ja;
 return <CommunityDialog title={t("この投稿を取り消しますか？","Cancel this submission?")} className={css.cancelDialog} busy={busy} onCancel={onCancel}>
  <p className={css.cancelTitle}>{title}</p>
  <p>{t("まだ受理されていない項目の処理を止め、投稿を取消済みにします。","Stop processing items that have not yet been accepted and mark this submission as cancelled.")}</p>
  <p className={css.muted}>{t("受理・公開済みの知識と元のCapsuleは残ります。公開停止は、公開先の訂正・運営への相談から行えます。","Accepted or published knowledge and the source Capsule remain. Request a public withdrawal through the published record.")}</p>
  {error&&<p role="alert">{error}</p>}
  {pending&&!busy&&<p role="status">{t("結果を確認できていません。閉じて、同じ操作の再試行か最新状態の確認を行ってください。","The result is unconfirmed. Close this dialog to retry the same operation or check its current state.")}</p>}
  <div className={css.endActions}><button type="button" autoFocus disabled={busy} onClick={onCancel}>{t("戻る","Keep submission")}</button><button type="button" data-variant="primary" disabled={busy||pending} onClick={onConfirm}>{busy?t("取り消しています…","Cancelling…"):t("投稿を取り消す","Cancel submission")}</button></div>
 </CommunityDialog>;
}
