"""Generate an isolated observer from existing Plunode UI; no production edits."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'experiments/ai-lab/.runtime/observer'
sys.path.insert(0, str(ROOT / 'experiments/ai-lab'))
from core import read_json, require
from runtime import held, read_sealed
from review import packet


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token', required=True)
    args = parser.parse_args()
    held(args.token)
    require(not OUT.is_symlink(), 'preview_symlink')
    require(OUT.resolve().is_relative_to(ROOT.resolve()), 'preview_outside_worktree')
    source = ROOT / 'docs/verification/ai-lab-20261022'
    public = read_sealed(source / 'public.json')
    review = read_json(source / 'review.json')
    require(review == packet(), 'stale_review')
    require(public['kgSha256'] == review['kgSha256'], 'review_kg_mismatch')
    # Revalidate the export against retained private records; never copy .runtime.
    from runtime import public_projection
    require(public == public_projection(ROOT / 'experiments/ai-lab/.runtime', [r['runId'] for r in public['runs']]), 'stale_public_export')
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ('app', 'components', 'lib', 'public', 'preview', 'data'):
        destination = OUT / name
        require(not destination.is_symlink(), 'generated_directory_symlink')
        if destination.exists():
            shutil.rmtree(destination)
    for name in ('components', 'lib'):
        shutil.copytree(ROOT / name, OUT / name)

    def write(name, content):
        destination = OUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content)

    def copy(src, dest):
        destination = OUT / dest
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, destination)

    def patch(name, before, after):
        destination = OUT / name
        text = destination.read_text()
        require(text.count(before) == 1, 'upstream_overlay_changed:' + name)
        destination.write_text(text.replace(before, after))

    for name in ('layout.tsx', 'layout.module.css', 'theme.css', 'ui.css', 'page.tsx', 'en/page.tsx',
                 'explore/[entityId]/page.tsx', 'en/explore/[entityId]/page.tsx', 'member/page.tsx',
                 'support/page.tsx', 'en/support/page.tsx', 'privacy/page.tsx', 'en/privacy/page.tsx'):
        copy(ROOT / 'app' / name, 'app/' + name)
    shutil.copytree(ROOT / 'app/fonts', OUT / 'app/fonts')
    shutil.copytree(ROOT / 'data/advertising', OUT / 'data/advertising')
    for src, dest in [('Lab.tsx.txt', 'preview/Lab.tsx'), ('navigation.tsx.txt', 'preview/navigation.tsx'),
                      ('state.ts.txt', 'preview/state.ts'),
                      ('lab.css', 'preview/lab.css'), ('api.ts.txt', 'app/api/[...path]/route.ts')]:
        copy(HERE / src, dest)
    for name in ('public.json', 'review.json', 'readiness.json'):
        copy(source / name, 'preview/' + name)
    copy(source / 'REVIEW.md', 'public/lab-review.md')
    character = ROOT / 'prototypes/official-ai-character'
    copy(character / 'CharacterStudy.tsx.txt', 'preview/CharacterStudy.tsx')
    copy(character / 'character.css', 'preview/character.css')
    copy(character / 'OfficialAi.tsx.txt', 'preview/OfficialAi.tsx')
    copy(character / 'official-ai.ts.txt', 'preview/official-ai.ts')
    copy(character / 'official-ai.css', 'preview/official-ai.css')
    shutil.copytree(character / 'assets', OUT / 'public/character-study')
    apprentice = ROOT / 'prototypes/apprentice-character'
    copy(apprentice / 'Apprentice.tsx.txt', 'preview/Apprentice.tsx')
    copy(apprentice / 'ApprenticeStudy.tsx.txt', 'preview/ApprenticeStudy.tsx')
    copy(apprentice / 'apprentice.css', 'preview/apprentice.css')
    copy(apprentice / 'MotionStudy.tsx.txt', 'preview/MotionStudy.tsx')
    copy(apprentice / 'motion.tsx.txt', 'preview/motion.tsx')
    copy(apprentice / 'LabApprenticeHero.tsx.txt', 'preview/LabApprenticeHero.tsx')
    copy(apprentice / 'motion.css', 'preview/motion.css')
    write('app/ai-apprentice-motion-study/page.tsx', """import MotionStudy from '../../preview/MotionStudy';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){const params=await searchParams;return <MotionStudy en={params.lang==='en'}/>;}
""")
    shutil.copytree(apprentice / 'assets', OUT / 'public/apprentice-study')
    write('app/ai-apprentice-study/page.tsx', """import ApprenticeStudy from '../../preview/ApprenticeStudy';
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}){const params=await searchParams;return <ApprenticeStudy en={params.lang==='en'}/>;}
""")
    write('app/ai-character-study/page.tsx', "import CharacterStudy from '../../preview/CharacterStudy';\nexport default function Page(){return <CharacterStudy/>;}\n")
    write('app/ai-lab/page.tsx', "import Lab from '../../preview/Lab';\nexport default function Page(){return <Lab/>;}\n")
    patch('app/layout.tsx', 'import FocusModality', "import {LabBoundary} from '../preview/navigation';\nimport '../preview/lab.css';\nimport FocusModality")
    patch('app/layout.tsx', '<FocusModality />', '<FocusModality /><LabBoundary />')
    patch('app/layout.tsx', 'import FocusModality', "import {CharacterContext} from '../preview/CharacterStudy';\nimport '../preview/character.css';\nimport FocusModality")
    patch('app/layout.tsx', '<LabBoundary />', '<LabBoundary /><CharacterContext />')
    patch('app/layout.tsx', "import '../preview/character.css';", "import '../preview/character.css';\nimport '../preview/official-ai.css';\nimport '../preview/apprentice.css';\nimport '../preview/motion.css';")
    patch('components/SiteHeader.tsx', 'import Icon', "import {rememberEntry} from '../preview/navigation';\nimport Icon")
    patch('components/SiteHeader.tsx', '<div className={styles.tools}>', '''<div className={styles.tools}><a className="lab-entry" data-testid="lab-entry" href="/ai-lab" onClick={event=>{closeAccount(event);if(!event.defaultPrevented)rememberEntry();}}>{locale==='en'?'AI Lab':'AI育成ラボ'}</a>''')
    # Real account component, intentionally disconnected identity; no fictional member records.
    patch('components/MemberCapsules.tsx', '<div className={css.memberContent}>', '''<div className={css.memberContent}><p className="lab-note">{locale==='en'?'Isolated preview. Account authentication and saved member data are not connected.':'隔離確認版です。アカウント認証・会員保存データは接続していません。'}</p>''')
    patch('components/ReferenceReader.tsx', 'import DialogCloseButton', "import {LabRecordReturn} from '../preview/navigation';\nimport DialogCloseButton")
    patch('components/ReferenceReader.tsx', '<DialogCloseButton label={text.close} onClick={onClose} /></div>', '<DialogCloseButton label={text.close} onClick={onClose} /></div><LabRecordReturn/>')
    # SSR reuses the existing local public-KG read helpers. The browser uses only the allowlisted HTTP proxy.
    # Reuse existing URL restoration, plus preview-only pan metadata bound to URL and KG revision.
    patch('lib/client/use-exploration-url.ts', '      setReady(true);', '''      try { const all=JSON.parse(sessionStorage.getItem('ai-lab-pan')||'{}');all[href]={pan:view.pan,revision:graph.revision};sessionStorage.setItem('ai-lab-pan',JSON.stringify(Object.fromEntries(Object.entries(all).slice(-10)))); } catch { /* URL restoration remains available. */ }
      setReady(true);''')
    patch('lib/client/use-exploration-url.ts', '        latest.current.apply(rebuilt);', '''        try { const extra=JSON.parse(sessionStorage.getItem('ai-lab-pan')||'{}')[location.pathname+location.search];if(extra&&extra.revision===rebuilt.graph.revision&&rebuilt.view&&Number.isFinite(extra.pan?.x)&&Number.isFinite(extra.pan?.y))rebuilt.view={...rebuilt.view,pan:extra.pan,recenter:false}; } catch { /* Optional metadata only. */ }
        latest.current.apply(rebuilt);''')
    write('next.config.mjs', "export default {reactStrictMode:true,experimental:{cpus:2},poweredByHeader:false};\n")
    write('tsconfig.json', json.dumps({'compilerOptions': {'target': 'ES2022', 'lib': ['dom','dom.iterable','esnext'], 'strict': True, 'skipLibCheck': True, 'noEmit': True, 'module': 'esnext', 'moduleResolution': 'bundler', 'jsx': 'react-jsx', 'esModuleInterop': True, 'resolveJsonModule': True, 'isolatedModules': True, 'plugins': [{'name':'next'}]}, 'include': ['**/*.ts','**/*.tsx','.next/types/**/*.ts'], 'exclude':['node_modules']}))
    copy(ROOT / 'package.json', 'package.json')
    common = Path(subprocess.check_output(['git','rev-parse','--git-common-dir'], cwd=ROOT, text=True).strip())
    dependencies = common.parent / 'node_modules'
    require(dependencies.is_dir(), 'existing_dependencies_missing')
    if not (OUT / 'node_modules').exists():
        (OUT / 'node_modules').symlink_to(dependencies, target_is_directory=True)
    proxy = (ROOT / 'proxy.ts').read_text()
    proxy = proxy.replace('  const host =', "  if(!['127.0.0.1:3268','localhost:3268','graph-ailab.isinxnisi.com'].includes(request.headers.get('host')||''))return new NextResponse(null,{status:404});\n  const host =")
    proxy = proxy.replace('return NextResponse.next({ request: { headers: requestHeaders } });', '''const response=NextResponse.next({request:{headers:requestHeaders}});
  response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','same-origin');
  response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'self'");return response;''')
    write('proxy.ts', proxy)
    overlay={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(HERE.iterdir()) if p.is_file() and (p.suffix in {'.txt','.css','.py','.mjs'})}
    overlay.update({str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(character.rglob('*')) if p.is_file()})
    overlay.update({str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(apprentice.rglob('*')) if p.is_file()})
    write('preview-source.json', json.dumps({'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT,text=True).strip(),'overlayFilesSha256':overlay,'publicSha256':read_json(source/'public.json')['sha256'],'productionRoutesChanged':False}))
    print(OUT)


if __name__ == '__main__':
    main()
