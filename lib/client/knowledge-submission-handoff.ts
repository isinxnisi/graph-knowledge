import {z} from "zod";
import {knowledgeSelectionCaptureSchema,knowledgeSubmissionSchema} from "../domain/knowledge-submission";
import {getMemberIdentitySnapshot} from "./use-member-identity";
import {memberRequest,MemberClientError} from "./member-api";
export {graphSubmissionSelection,capsuleSubmissionSelection,knowledgeSubmissionSelection} from "../domain/knowledge-submission-selection";
type Capture=z.input<typeof knowledgeSelectionCaptureSchema>;

export async function createSelectionSubmission(selection: Pick<Capture,"context"|"content">) {
  const identity=getMemberIdentitySnapshot();
  if(identity.status!=="authenticated"||!identity.user)throw new MemberClientError(401,"UNAUTHENTICATED");
  const command=knowledgeSelectionCaptureSchema.parse({...selection,action:"capture-selection",id:crypto.randomUUID(),requestId:crypto.randomUUID(),expectedVersion:0});
  const result=await memberRequest("/api/member/knowledge-submissions",z.object({submission:knowledgeSubmissionSchema}),{method:"POST",body:command,user:identity.user.id});
  return "/member/submissions?id="+encodeURIComponent(result.submission.id);
}
export function submissionHandoffError(error:unknown,en=false){
  if(error instanceof MemberClientError&&error.status===401)return en?"Sign in before submitting knowledge. Your selection remains here.":"知識の投稿にはログインが必要です。選択はこの画面に残っています。";
  if(error instanceof MemberClientError&&error.status===409)return en?"The source has changed. Refresh it and try again.":"取得元が更新されています。取得元を更新して、選び直してください。";
  return en?"Could not create a draft. Keep this view and try again.":"投稿の草稿を作成できませんでした。この画面を残したまま再試行してください。";
}
