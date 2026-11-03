"use client";
import type {KnowledgeSubmission,KnowledgeSubmissionContent} from "../lib/domain/knowledge-submission";
import CapsuleTimeFields from "./CapsuleTimeFields";
import Icon from "./Icon";
import css from "./KnowledgeSubmissions.module.css";
type Item=KnowledgeSubmissionContent["items"][number];
type Hint={available:boolean;hints:string[]};
type Props={item:Item;index:number;content:KnowledgeSubmissionContent;context?:KnowledgeSubmission["context"];disabled:boolean;canRemove:boolean;locale:string;showHints:boolean;hintBusy:boolean;hintDisabled:boolean;hint?:Hint;
 onRemove:()=>void;onRecord:(value:Partial<Item["record"]>)=>void;onRegistration:(value:string)=>void;onEndpoint:(field:"subjectId"|"objectId",value:string)=>void;onEntityKind:(value:string)=>void;onSource:(id:string,field:"title"|"url"|"bibliography",value:string)=>void;onEvidence:(id:string,field:"locator"|"excerpt",value:string)=>void;onAddSource:()=>void;onHint:()=>void;};
function Label({text,need}:{text:string;need?:string}){return <span className={css.fieldLabel}><span>{text}</span>{need&&<small aria-hidden="true">{need}</small>}</span>;}
export default function KnowledgeSubmissionItem(p:Props){
 const {item,index,content,context}=p,r=item.record,t=(ja:string,en:string)=>p.locale==="en"?en:ja,required=t("必須","Required");
 const ownSubject=content.entities.find(e=>e.id===r.subjectId),knownSubject=context?.entities.find(e=>e.id===r.subjectId);
 const isEntity=r.kind==="note"&&!!r.subjectId,kind=isEntity?"entity":r.kind;
 const name=(id:string|null)=>content.entities.find(e=>e.id===id)?.content.name??context?.entities.find(e=>e.id===id)?.content.name??id??"";
 const classification=ownSubject?.content.kind??knownSubject?.content.kind??"対象";
 return <section className={css.item}>
  <div className={css.itemHeading}><h2>{t("項目","Item")} {index+1}</h2>{item.correction&&<span className={css.meta}>{t("取得版の訂正候補","Correction to captured record")} · {item.correction.revision}</span>}{p.canRemove&&<button disabled={p.disabled} aria-label={t("項目を外す","Remove item")} title={t("項目を外す","Remove item")} onClick={p.onRemove}><Icon name="trash"/></button>}</div>
  <fieldset disabled={p.disabled} className={css.itemFields}><legend className={css.srOnly}>{t("知識と根拠","Knowledge and sources")}</legend><div className={css.itemGrid}>
   <section className={css.facts} aria-label={t(`項目${index+1}の事実`,`Item ${index+1} facts`)}>
    <label>{t("登録する情報","What to register")}<select value={kind} onChange={e=>p.onRegistration(e.target.value)}>
     <option value="entity">{t("人物・作品など","Person, work or other subject")}</option><option value="relation">{t("2つの対象のつながり","Connection between two subjects")}</option><option value="episode">{t("出来事","Event")}</option><option value="note">{t("説明・背景","Note / context")}</option>
    </select></label>
    {isEntity&&<><div className={css.columns}>
     <label><Label text={t("人物・作品の名前","Subject name")} need={required}/><input aria-label={t("人物・作品の名前","Subject name")} aria-required="true" maxLength={200} readOnly={content.entityPins.some(v=>v.id===r.subjectId)} value={name(r.subjectId)} placeholder={t("例：浦沢直樹","For example: Naoki Urasawa")} onChange={e=>p.onEndpoint("subjectId",e.target.value)}/></label>
     <label>{t("分類","Category")}<select disabled={!ownSubject} value={classification} onChange={e=>p.onEntityKind(e.target.value)}>{!['人物','作品','組織','場所','出来事','対象'].includes(classification)&&<option value={classification}>{classification}</option>}<option value="人物">{t("人物","Person")}</option><option value="作品">{t("作品","Work")}</option><option value="組織">{t("組織","Organization")}</option><option value="場所">{t("場所","Place")}</option><option value="出来事">{t("出来事","Event")}</option><option value="対象">{t("その他","Other")}</option></select></label>
    </div><small className={css.hint}>{ownSubject?t("新しい人物や作品も、事実と根拠を添えて登録できます。","New subjects can be registered with a fact and supporting source."):t("登録済みの対象です。名前を保ったまま、事実を追加・訂正します。","Keep this existing subject's identity while adding or correcting a fact.")}</small></>}
    <label><Label text={t("登録する事実","Fact to register")} need={required}/><textarea aria-label={t("登録する事実","Fact to register")} aria-required="true" rows={2} maxLength={4000} value={r.assertion} placeholder={isEntity?t("例：浦沢直樹は日本の漫画家。","For example: Naoki Urasawa is a Japanese manga artist."):r.kind==="relation"?t("例：浦沢直樹は漫画『PLUTO』を描いた。","For example: Naoki Urasawa drew PLUTO."):t("資料で確かめた事実を、一文で書いてください","Write one fact you verified in the source")} onChange={e=>p.onRecord({assertion:e.target.value})}/></label>
    <small className={css.hint}>{t("資料に書かれた事実を、自分の言葉で。感想や推測は含めません。","Describe a source-backed fact in your own words; omit opinions and guesses.")}</small>
    {r.kind==="relation"&&<><div className={css.columns}>{(["subjectId","objectId"] as const).map((field,i)=><label key={field}><Label text={i===0?t("つながりの起点","From"):t("つながりの相手","To")} need={required}/><input aria-label={i===0?t("つながりの起点","From"):t("つながりの相手","To")} aria-required="true" maxLength={200} readOnly={content.entityPins.some(v=>v.id===r[field])} value={name(r[field])} placeholder={i===0?t("例：浦沢直樹","For example: Naoki Urasawa"):t("例：PLUTO","For example: PLUTO")} onChange={e=>p.onEndpoint(field,e.target.value)}/></label>)}</div>
     <label><Label text={t("矢印に表示する言葉","Words on the arrow")} need={required}/><input aria-label={t("矢印に表示する言葉","Words on the arrow")} aria-required="true" value={r.relation} maxLength={200} placeholder={t("例：漫画を描いた／影響を受けた","For example: drew / was influenced by")} onChange={e=>p.onRecord({relation:e.target.value})}/></label>
     <small className={css.hint}>{t("図には短い言葉、詳しい説明には上の「登録する事実」を使います。","The graph uses these short words; the fact above is the full explanation.")}</small>
    </>}
    <details className={css.extra}><summary>{t("補足・時期（任意）","Extra details and time (optional)")}{r.times.length>0&&<span className={css.meta}> · {t("時期","Times")} {r.times.length}</span>}</summary>
     <label>{t("事実の補足（任意）","Qualification (optional)")}<textarea rows={2} maxLength={3000} value={r.scope} placeholder={t("例：第1巻の日本語版について（必要なときだけ）","For example: applies only to the Japanese first volume")} onChange={e=>p.onRecord({scope:e.target.value})}/></label><small className={css.hint}>{t("当てはまる作品・地域などを狭める必要があるときだけ書きます。","Only add this to limit the fact to a particular work, place or similar scope.")}</small>
     <label>{t("資料での扱い","How the source treats this fact")}<select value={r.polarity} onChange={e=>p.onRecord({polarity:e.target.value as Item["record"]["polarity"]})}><option value="affirmed">{t("事実として書かれている","Stated as a fact")}</option><option value="denied">{t("否定されている","Denied")}</option><option value="uncertain">{t("不確かと書かれている","Stated as uncertain")}</option></select></label>
     <CapsuleTimeFields value={r.times} onChange={times=>p.onRecord({times})} locale={p.locale} guidance/>
    </details>
    {p.showHints&&<div className={css.advice}><button type="button" className={css.quiet} disabled={p.disabled||p.hintDisabled} onClick={p.onHint}><Icon name="search"/>{p.hintBusy?t("ヒントを確認中…","Checking hints…"):t("入力のヒント（任意）","Optional input hints")}</button>{p.hint&&<div role="status"><p>{!p.hint.available?t("今はヒントを確認できません。そのまま投稿できます。","Hints are unavailable. You can still submit."):p.hint.hints.length?p.hint.hints.join(" "):t("この確認では気になる点は見つかりませんでした。","This check found no concerns.")}</p><small>{t("ヒントは誤ることがあります。従わずにそのまま投稿できます。","Hints can be wrong. You may submit without following them.")}</small></div>}</div>}
   </section>
   <section className={css.sources} aria-label={t(`項目${index+1}の根拠`,`Item ${index+1} sources`)}>
    <div className={css.sourceHeading}><h3>{t("確かめた資料","Source you checked")}</h3><small>{t("公開時に必要","Needed for publication")}</small></div>
    {!r.evidence.length&&<p className={css.hint}>{t("事実を確かめた記事や本を添えます。草稿は資料なしでも保存できます。","Add the article or book you checked. A draft can be saved without sources.")}</p>}
    {r.evidence.map((ev,n)=>{const own=content.sources.find(v=>v.id===ev.source.id),known=context?.sources.find(v=>v.id===ev.source.id&&v.revision===ev.source.revision);return <div key={ev.id} className={css.sourceCard}>
     <div className={css.sourceHeading}><span>{t("資料","Source")} {n+1}</span><button type="button" className={css.quiet} aria-label={t("この根拠を外す","Remove evidence")} title={t("この根拠を外す","Remove evidence")} onClick={()=>p.onRecord({evidence:r.evidence.filter(v=>v.id!==ev.id)})}><Icon name="trash"/></button></div>
     {own?<><div className={css.columns}><label><Label text={t("記事・本の名前","Article or book title")} need={required}/><input aria-label={t("記事・本の名前","Article or book title")} aria-required="true" maxLength={300} value={own.content.title} placeholder={t("例：『PLUTO』作者インタビュー","For example: PLUTO author interview")} onChange={e=>p.onSource(own.id,"title",e.target.value)}/></label>
      <label><Label text={t("資料のURL","Source URL")} need={t("URLか本の情報","URL or book details")}/><input aria-label={t("資料のURL","Source URL")} type="url" maxLength={2000} value={own.content.url??""} placeholder="https://…" onChange={e=>p.onSource(own.id,"url",e.target.value)}/></label></div>
      <details className={css.paper}><summary>{t("本・紙の資料／書誌情報","Book or print source / bibliography")}</summary><label>{t("本の情報（URLがないとき）","Book details (without a URL)")}<input maxLength={4000} value={own.content.bibliography} placeholder={t("例：著者『書名』出版社、2020年","Author, book title, publisher, 2020")} onChange={e=>p.onSource(own.id,"bibliography",e.target.value)}/></label><small className={css.hint}>{t("本だけでも草稿に保存できます。現在の公開確認にはWebのURLが必要です。","Book-only sources can be saved in drafts. Publication currently needs a web URL.")}</small></details>
     </>:<p className={css.sourceLine}>{known?.content.title??ev.source.id} · {t("登録済みの資料","Existing source")} {ev.source.revision}</p>}
     <label><Label text={t("書かれている場所","Where it is written")} need={required}/><input aria-label={t("書かれている場所","Where it is written")} aria-required="true" maxLength={1000} value={ev.locator} placeholder={t("例：「作者紹介」の段落／24ページ","For example: Author section / page 24")} onChange={e=>p.onEvidence(ev.id,"locator",e.target.value)}/></label>
     <label><Label text={t("その部分の原文","Original wording")} need={t("公開時必須","Required for publication")}/><textarea aria-label={t("その部分の原文","Original wording")} rows={2} maxLength={4000} value={ev.excerpt} placeholder={t("例：「漫画：浦沢直樹」など、資料の文をコピー","Copy the original words from the source")} onChange={e=>p.onEvidence(ev.id,"excerpt",e.target.value)}/></label><small className={css.hint}>{t("ここは資料の文をそのまま引用します。自分の説明や要約は書きません。","Quote the original wording here, not your own explanation or summary.")}</small>
    </div>;})}
    <button type="button" className={css.quiet} disabled={r.evidence.length>=20} onClick={p.onAddSource}><Icon name="plus"/>{t("資料を追加","Add source")}</button>
   </section>
  </div></fieldset>
 </section>;
}
