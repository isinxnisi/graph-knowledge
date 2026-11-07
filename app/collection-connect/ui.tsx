'use client';
import {useState} from 'react';
export function MissionConnection({state,query,host}:{state:'invalid'|'login'|'operator-required'|'consent';query:string;host:string}){
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function act(accept:boolean){setBusy(true);setError('');try{
  const response=await fetch(state==='login'?'/api/auth/sign-in/social':'/api/auth/oauth2/consent',{
   method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
   body:JSON.stringify(state==='login'?{provider:'google',callbackURL:location.origin+'/collection-connect?'+query,disableRedirect:true,oauth_query:query}:{accept,oauth_query:query}),
  });
  const data=await response.json();if(!response.ok||typeof data.url!=='string')throw Error();
  location.assign(data.url);
 }catch{setError('接続を続けられませんでした。ChatGPTから接続を開き直してください。');setBusy(false);}}
 if(state==='invalid')return <><p>接続の依頼が見つからないか、期限が切れています。</p><p>ChatGPTのPlunode接続から、もう一度開いてください。</p></>;
 if(state==='operator-required')return <p>この接続は、資料収集を設定できる運営アカウントで利用できます。</p>;
 return <><p>設定したテーマの調査内容をChatGPTに渡し、見つかった資料と知識をPlunodeへ届けます。</p><ul><li>取得できるのは、対象となる収集計画と、その範囲の公開資料です。</li><li>結果は既存の確認処理へ進みます。会員情報や管理操作は渡しません。</li><li>接続の停止はChatGPTのプラグイン設定から行えます。</li></ul>{state==='consent'&&<p>接続先：{host}</p>}<div className="mission-connect-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void act(true)}>{busy?'接続中…':state==='login'?'Googleでログイン':'資料収集の接続を許可'}</button>{state==='consent'&&<button type="button" disabled={busy} onClick={()=>void act(false)}>キャンセル</button>}</div>{error&&<p role="alert">{error}</p>}</>;
}
