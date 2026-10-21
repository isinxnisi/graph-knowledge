from pathlib import Path
import shutil,json,subprocess
ROOT=Path(__file__).resolve().parents[2]
OUT=Path.home()/'.local/share/plunode-community-connected'
OUT.mkdir(parents=True,exist_ok=True)
# Only generated source folders are replaced. No environment, DB, uploads or repository is served.
for name in ['components','lib']:
 if (OUT/name).exists():shutil.rmtree(OUT/name)
 shutil.copytree(ROOT/name,OUT/name)
for name in ['app','public','preview']:
 if (OUT/name).exists():shutil.rmtree(OUT/name)
 (OUT/name).mkdir()
for name in ['layout.tsx','layout.module.css','theme.css','ui.css']:
 shutil.copy2(ROOT/'app'/name,OUT/'app'/name)
shutil.copytree(ROOT/'app/fonts',OUT/'app/fonts')
if (ROOT/'public').exists():shutil.copytree(ROOT/'public',OUT/'public',dirs_exist_ok=True)
for src,dest in [('Preview.tsx.txt','preview/Preview.tsx'),('member.ts.txt','preview/member.ts'),('api.ts.txt','app/api/[...path]/route.ts'),('preview.css','preview/preview.css')]:
 target=OUT/dest;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(Path(__file__).parent/src,target)
def write(path,txt):
 p=OUT/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(txt)
def patch(path,before,after):
 p=OUT/path;s=p.read_text();assert before in s,(path,before);p.write_text(s.replace(before,after))
for path in ['page.tsx','en/page.tsx','explore/[entityId]/page.tsx','en/explore/[entityId]/page.tsx','member/page.tsx']:
 target=OUT/'app'/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'app'/path,target)
write('app/communities/page.tsx','''import {CommunityFrame,PreviewReturn,CommunityHeader} from '../../preview/Preview';
export default function Page(){return <><CommunityHeader/><PreviewReturn/><CommunityFrame/></>;}''')
patch('app/layout.tsx','import FocusModality',"import {PreviewBanner} from '../preview/Preview';\nimport '../preview/preview.css';\nimport FocusModality")
patch('app/layout.tsx','<FocusModality />','<FocusModality /><PreviewBanner />')
patch('components/SiteHeader.tsx','import Icon',"import {rememberPreviewEntry} from '../preview/Preview';\nimport Icon")
patch('components/SiteHeader.tsx','<div className={styles.tools}>','''<div className={styles.tools}><a data-testid="community-entry" className="preview-community-entry" href="/communities" onClick={event=>{closeAccount(event);if(!event.defaultPrevented)rememberPreviewEntry();}}>{locale==='en'?'Communities':'コミュニティ'}</a>''')
patch('components/Explorer.tsx','import Icon',"import {CommunityGraphReturn} from '../preview/Preview';\nimport Icon")
patch('components/Explorer.tsx','return <><div className={styles.explorer}>','return <><CommunityGraphReturn/><div className={styles.explorer}>')
patch('lib/client/member-api.ts','import { z }',"import {previewMember} from '../../preview/member';\nimport { z }")
a=(OUT/'lib/client/member-api.ts').read_text();start=a.index('  const response = await fetch(path,');end=a.index('\n}\nexport const memberListSchema',start)
a=a[:start]+'''  return schema.parse(await previewMember(path,options));'''+a[end:];(OUT/'lib/client/member-api.ts').write_text(a)
patch('components/MemberCapsules.tsx','import { focusDestination',"import {ListingLink,AccountCommunity,rememberPreviewEntry} from '../preview/Preview';\nimport { focusDestination")
patch('components/MemberCapsules.tsx','    </nav>}','''      <a href="#community-membership">{locale==='en'?'Communities & invitations':'参加・運営・招待'}</a>
    </nav>}''')
patch('components/MemberCapsules.tsx','<div className={css.memberContent}>','''<div className={css.memberContent}><p className="preview-write-note">{locale==='en'?'Fictional account. Reading and navigation work; account writes, sharing links and deletion are not connected.':'架空アカウント。閲覧と導線の確認用です。会員保存・リンク発行・削除は未接続です。'}</p>''')
patch('components/MemberCapsules.tsx','<div hidden={section !== "saved"}>','<section id="community-membership"><AccountCommunity/></section><div hidden={section !== "saved"}>')
patch('components/MemberCapsules.tsx','<div className={css.actions}><button disabled={busy || !!draft} onClick={() => read(item.id)}>','<div className={css.actions}><ListingLink id={item.id}/><button disabled={busy || !!draft} onClick={() => read(item.id)}>')
patch('components/MemberCapsules.tsx','{!historical && <nav className={css.readingTabs}', '<ListingLink id={selected.id}/>{!historical && <nav className={css.readingTabs}')
patch('components/MemberCapsules.tsx','"saved" | "settings" | "posts"','"saved" | "settings" | "posts" | "community"')
patch('components/MemberCapsules.tsx','setSection(location.hash ===', 'setSection(location.hash === "#community-membership" ? "community" : location.hash ===')
patch('components/MemberCapsules.tsx','const title = !user ?', 'const title = section === "community" ? (locale === "en" ? "Communities & invitations" : "参加・運営・招待") : !user ?')
patch('components/MemberCapsules.tsx','<section id="community-membership">','<section id="community-membership" hidden={section!=="community"}>')
patch('components/MemberCapsules.tsx','<a href="#community-membership">','<a href="#community-membership" aria-current={section==="community"?"page":undefined}>')
with (OUT/'components/MemberCapsules.module.css').open('a') as f:f.write('@media(max-width:800px){.memberNavigation{flex-wrap:wrap}.memberNavigation a{flex:0 1 auto;white-space:normal}}')

patch('components/SiteHeader.tsx','{text.explore}</span>',"{returnHref==='/'?(locale==='en'?'Home':'ホーム'):text.explore}</span>")
patch('components/MemberCapsules.tsx','disabled={busy}\n      onChange=', 'disabled={true}\n      onChange=')
patch('components/MemberCapsules.tsx','disabled={busy || !!draft || !!profileDraft}', 'disabled={true}')
patch('components/MemberCapsules.tsx','userId={user.id} disabled={busy} onUnauthorized=', 'userId={user.id} disabled={true} onUnauthorized=')
patch('components/MemberCapsules.tsx','<button disabled={busy} onClick={() => setConfirm("remove")}', '<button disabled={true} onClick={() => setConfirm("remove")}')
patch('lib/client/use-exploration-url.ts','      setReady(true);',"""      try { const all=JSON.parse(sessionStorage.getItem('preview-pan')||'{}');all[href]={pan:view.pan,role:sessionStorage.getItem('preview-role')||'aya',revision:graph.revision};sessionStorage.setItem('preview-pan',JSON.stringify(Object.fromEntries(Object.entries(all).slice(-10)))); } catch { /* Existing URL restore remains available. */ }
      setReady(true);""")
patch('lib/client/use-exploration-url.ts','        latest.current.apply(rebuilt);',"""        try { const extra=JSON.parse(sessionStorage.getItem('preview-pan')||'{}')[location.pathname+location.search];if(extra&&extra.role===(sessionStorage.getItem('preview-role')||'aya')&&extra.revision===rebuilt.graph.revision&&rebuilt.view&&Number.isFinite(extra.pan?.x)&&Number.isFinite(extra.pan?.y)){rebuilt.view={...rebuilt.view,pan:extra.pan,recenter:false};} } catch { /* Ignore invalid optional viewport metadata. */ }
        latest.current.apply(rebuilt);""")

patch('components/MemberCapsules.tsx','<p>{user ? section ===', '<p>{section === "community" ? (locale === "en" ? "Your memberships, managed spaces and invitations." : "参加先、運営先、招待をまとめて確認します。") : user ? section ===')
# No real account mutation or authentication route is included. Use an allowlisted read proxy only.
write('next.config.mjs',"export default {reactStrictMode:true,experimental:{cpus:2},poweredByHeader:false};\n")
write('tsconfig.json',json.dumps({'compilerOptions':{'target':'ES2022','lib':['dom','dom.iterable','esnext'],'strict':True,'skipLibCheck':True,'noEmit':True,'module':'esnext','moduleResolution':'bundler','jsx':'react-jsx','esModuleInterop':True,'resolveJsonModule':True,'isolatedModules':True,'plugins':[{'name':'next'}]},'include':['**/*.ts','**/*.tsx','.next/types/**/*.ts'],'exclude':['node_modules']}))
shutil.copytree(ROOT/'data/advertising',OUT/'data/advertising',dirs_exist_ok=True)
shutil.copy2(ROOT/'package.json',OUT/'package.json')
if not (OUT/'node_modules').exists():(OUT/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
proxy=(ROOT/'proxy.ts').read_text();proxy=proxy.replace('  const host =', '''  const allowed=['127.0.0.1:3275','localhost:3275','graph-com.isinxnisi.com'];
  if(!allowed.includes(request.headers.get('host')||''))return new NextResponse(null,{status:404});
  const host =''');proxy=proxy.replace('return NextResponse.next({ request: { headers: requestHeaders } });', '''const response=NextResponse.next({request:{headers:requestHeaders}});
  response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');response.headers.set('Cache-Control','no-store');
  response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'self'");return response;''');write('proxy.ts',proxy)
study=OUT/'public/study';shutil.copytree(ROOT/'prototypes/community',study,ignore=shutil.ignore_patterns('*.test.mjs','README.md','server.mjs'))
p=study/'index.html';p.write_text(p.read_text().replace('href="/style.css"','href="/study/style.css"').replace('src="/app.mjs"','src="/study/app.mjs"'))
p=study/'app.mjs';s=p.read_text();s=s.replace("let s=fixture(),lang='ja'", "let s=JSON.parse(sessionStorage.getItem('community-connection-state')||'null')||fixture(),lang=localStorage.getItem('graph-knowledge.ui-locale.v1')||'ja'")
s=s.replace("const graphStates=new Map(),positions=new Map()", "s.viewer=sessionStorage.getItem('preview-role')||'aya';\nconst graphStates=new Map(),positions=new Map(JSON.parse(sessionStorage.getItem('community-connection-positions')||'[]'))")
s=s.replace('function render(){', '''function render(){s.viewer=sessionStorage.getItem('preview-role')||'aya';sessionStorage.setItem('community-connection-state',JSON.stringify(s));sessionStorage.setItem('community-connection-lang',lang);sessionStorage.setItem('community-connection-positions',JSON.stringify([...positions]));parent.postMessage({kind:'route',hash:'#'+encodeURIComponent(JSON.stringify(route))},location.origin);''')
s=s.replace("root.innerHTML=header()+", "root.innerHTML=")
s=s.replace("if(action==='graph'){nav", "if(action==='graph'){if(!reference(s,{capsule:d.capsule,revision:Number(d.revision)},d.community||route.cid))return;positions.set(routeKey(),scrollY);sessionStorage.setItem('community-connection-positions',JSON.stringify([...positions]));parent.postMessage({kind:'graph',capsule:d.capsule},location.origin);return;}\nif(action==='unusedGraph'){nav")
s=s.replace("if(action==='account'){nav({page:'account'});return;}", "if(action==='account'){parent.postMessage({kind:'account'},location.origin);return;}")
s=s.replace("if(action==='top'){nav({page:'top'});return;}", "if(action==='top'){parent.postMessage({kind:'home'},location.origin);return;}")
s += "\naddEventListener('pageshow',()=>{s=JSON.parse(sessionStorage.getItem('community-connection-state')||'null')||fixture();s.viewer=sessionStorage.getItem('preview-role')||'aya';render();});document.addEventListener('visibilitychange',()=>{if(document.hidden)root.replaceChildren();else {s=JSON.parse(sessionStorage.getItem('community-connection-state')||'null')||fixture();s.viewer=sessionStorage.getItem('preview-role')||'aya';render();}});\nnew ResizeObserver(()=>parent.postMessage({kind:'height',height:Math.ceil(root.getBoundingClientRect().height)},location.origin)).observe(root);\n"
# c2 is explicitly a demonstration listing with a real public reference, never an asserted research claim.
s=s.replace('試作のGraph・Capsule・人物・活動数はすべて架空です。公開KGへの貢献を示しません。','会員・掲載・説明は架空です。Graphは本線Explorerで公開KGの参照先を開きます。').replace('All Graphs, Capsules, people and activity figures are fictional, not public KG contributions.','Accounts, listings and descriptions are fictional. Graph opens public KG references in the existing Explorer.')
p.write_text(s)
with (study/'style.css').open('a') as f:f.write('''\nmain{max-width:1080px;padding:12px 24px 32px;min-height:0}.community-hero{padding:10px 0 18px;gap:24px}.community-hero h1{font-size:28px;margin:10px 0 8px}.community-hero p{font-size:13px;line-height:1.75}.orbit{display:none}.breadcrumb{margin-bottom:12px}.tabs{gap:24px}.tabs button{padding:10px 3px}.home-layout{padding-top:22px;gap:28px;grid-template-columns:minmax(0,1fr) 270px}.section-heading{margin:20px 0 15px}h2{font-size:22px}.capsule-row{padding:16px 0;gap:12px}.row-content h3{font-size:18px}.row-content p{margin:4px 0 6px}.capsule-mark{width:32px;height:32px}.community-link{padding:16px;gap:8px}.community-link strong{font-size:20px}.management{padding-top:22px;gap:28px}.setting{padding:18px 0}.soft-note{margin-top:20px;padding:16px}footer{margin-top:28px}.graph-stage{display:none}@media(max-width:680px){main{padding:12px 16px 28px}.community-hero h1{font-size:25px;margin-top:23px}.home-layout{display:flex}.capsule-row{padding:15px 0}.row-content p{font-size:13px}.row-actions .text-button{font-size:12px}.management{gap:18px}.community-hero p{font-size:13px}.managing .community-hero h1{font-size:25px}}''')
write('preview-source.json',json.dumps({'source':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'generated':True,'productionRoutesChanged':False}))
print(OUT)
