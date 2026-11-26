import React, {useEffect, useState} from 'react';
import {
  AbsoluteFill, Audio, Composition, Img, cancelRender, continueRender, delayRender,
  interpolate, Easing, registerRoot, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import timing from './public/timing.json';

const W = 1440;
const H = 810;
const C = {paper: '#f5f1e7', ink: '#172936', blue: '#235c85', orange: '#c86628', muted: '#506471'};
const serif = '"Noto Serif JP", "Yu Mincho", serif';
const sans = '"Noto Sans JP", "Yu Gothic", sans-serif';
const smooth = Easing.bezier(0.36, 0, 0.20, 1);
const lerp = (t, xs, ys, easing = smooth) => interpolate(t, xs, ys, {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing,
});
const enter = (t, at, span = .46) => lerp(t, [at, at + span], [0, 1]);
const leave = (t, at, span = .44) => 1 - enter(t, at, span);
const pulse = (t, at, span = .45) => Math.max(0, Math.sin(Math.PI * enter(t, at, span)));
const ell = (cx, cy, rx, ry, opacity, fill = C.ink) =>
  <ellipse {...{cx, cy, rx, ry, opacity, fill}}/>;
const url = staticFile;
const ROOM = url('room.png');
const HERO = url('traveler.png');
const FIELDS = url('outside.png');

function Canvas({children}) {
  return <svg viewBox="0 0 1440 810" width={W} height={H}
    style={{position: 'absolute', overflow: 'hidden'}} aria-hidden>{children}</svg>;
}
function Copy({x, y, children, size = 44, color = C.ink, family = serif, weight = 650, style = {}}) {
  return <div style={{position: 'absolute', left: x, top: y, color, fontFamily: family,
    fontWeight: weight, fontSize: size, lineHeight: 1.35, whiteSpace: 'pre', ...style}}>{children}</div>;
}
function Brand() {
  return <Img src={url('brand.png')}
    style={{position: 'absolute', left: 58, top: 38, width: 140}}/>;
}
function Note({x, y, children}) {
  return <Copy x={x} y={y} size={21} family={sans} weight={560} color={C.muted}>{children}</Copy>;
}
function OvalKey({x, y, scale = 1, angle = -28, opacity = 1}) {
  return <g opacity={opacity} transform={'translate('+x+' '+y+') scale('+scale+') rotate('+angle+')'}>
    <path d="M-27-18C-45-18-51-2-44 10s22 15 32 5H48V6H37v10H25V8H11V-2h-23C-15-14-20-19-27-18z
    M-29-9a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" fillRule="evenodd" fill="#eeb760" stroke="#6a4029" strokeWidth="3"/>
    <path d="M-42 1q-1-16 15-16m18 19H42" fill="none" stroke="#fff0ba" strokeWidth="2.1" strokeLinecap="round"/>
  </g>;
}
function Hero({x, y, size = 175, facing = 1, tilt = 0, opacity = 1, shadow = 1}) {
  return <g opacity={opacity}>
    {ell(x, y - 4, size*.30, size*.045, .20 * shadow)}
    <g transform={'translate('+x+' '+y+') rotate('+tilt+') scale('+facing+' 1)'}>
      <image href={HERO} x={-size*.55} y={-size} width={size*1.10} height={size}
        preserveAspectRatio="xMidYMax meet"/>
    </g>
  </g>;
}
// Coordinates correspond to the original illustration, shared by the close-up and reveal.
const doorPath = 'M1353 687L1354 473Q1360 399 1423 380Q1470 362 1500 409Q1524 435 1529 488L1528 732Z';
function CloseDoor({t, opening = 0, knock = false, location = [1048, 387], scale = 1.84}) {
  const [x, y] = location;
  const shake = knock ? (pulse(t, 1.31, .14) - pulse(t, 1.64, .15)) * .75 : 0;
  const q = opening;
  return <Canvas>
    <defs>
      <clipPath id="blue-door"><path d={doorPath}/></clipPath>
      <linearGradient id="fog"><stop stopColor="#f5f0e3"/><stop offset=".58" stopColor="#f5f0e3" stopOpacity=".98"/>
        <stop offset="1" stopColor="#f5f0e3" stopOpacity="0"/></linearGradient>
      <radialGradient id="day"><stop stopColor="#fff6bd"/><stop offset="1" stopColor="#e3aa6c"/></radialGradient>
    </defs>
    <g transform={'translate('+x+' '+y+') scale('+scale+') translate(-1444 -557)'}>
      <image href={ROOM} width="1672" height="941"/>
      <g clipPath="url(#blue-door)">
        <rect x="1350" y="370" width="187" height="370" fill="url(#day)"/>
        <path d="M1352 381l60 61h77l48-61v331l-53-76h-72l-60 77z" fill="#b68056"/>
        <path d="M1409 443h79v198h-79z" fill="#473d37"/>
        <path d="M1418 448h60v166h-60z" fill="#e9c17f"/>
        <path d="M1353 727l67-112h57l55 120zm28-45h132m-118-21h101m-90-19h79m-70-15h64"
          fill="#c7a179" stroke="#77593f" strokeWidth="3"/>
        <path d="M1357 481l54 28m-54 32 54 16m86-48 36-21m-36 68 36-15"
          fill="none" stroke="#966040" strokeWidth="3" opacity=".6"/>
        <rect x="1350" y="370" width="185" height="370" fill="#fbd691" opacity={q * .17}/>
        <g transform={'translate(1354 0) scale('+Math.max(.035, 1 - q * .975)+' 1) translate('+(-1354 + shake)+' 0)'}>
          <image href={ROOM} width="1672" height="941" clipPath="url(#blue-door)"/>
        </g>
      </g>
      {knock && [0,1].map(i => {
        const p = pulse(t, 1.31 + i*.33, .3);
        return <path key={i} opacity={p*.9} d="M1495 510l17-13m-10 27 23-2m-21 16 13 7"
          stroke="#fff1af" strokeWidth="3" strokeLinecap="round" fill="none"/>;
      })}
    </g>
    <rect width="912" height={H} fill="url(#fog)"/>
  </Canvas>;
}

function Intro({t}) {
  const title = enter(t, 1.72, .88);
  return <>
    <CloseDoor t={t} knock location={[1060 + t*.7, 385]} scale={1.84 + t*.0025}/>
    <Brand/>
    <Copy x={93} y={190} size={27} family={sans} color={C.blue}
      style={{opacity: title, letterSpacing: 2}}>1986年　ファミコン</Copy>
    <Copy x={92} y={248} size={85} style={{opacity: title, transform: 'translateY('+((1-title)*11)+'px)'}}>
      {'さいしょの扉が、\n開かない。'}
    </Copy>
    <div style={{position: 'absolute', left: 96, top: 511, height: 4, width: 89*title, background: C.orange}}/>
    <Copy x={95} y={556} size={28} weight={540} style={{opacity: enter(t, 4.2, .76)}}>
      初代『ドラゴンクエスト』の小さな部屋
    </Copy>
  </>;
}

function Memory({t}) {
  const glow = enter(t, 4.23, .47);
  const parallax = lerp(t, [0, 10], [1, 1.032], Easing.linear);
  return <>
    <Canvas>
      <defs>
        <clipPath id="crt"><path d="M750 233Q755 162 831 159L1133 159Q1198 157 1198 219L1197 463Q1194 526 1122 528L820 528Q753 527 751 466Z"/></clipPath>
        <linearGradient id="tv-wall"><stop stopColor="#f4e6cb" stopOpacity=".86"/><stop offset=".79" stopColor="#f8ead0" stopOpacity=".43"/><stop offset="1" stopColor="#f3e1bd" stopOpacity="0"/></linearGradient>
      </defs>
      <g transform={'translate(720 420) scale('+parallax+') translate(-720 -420)'}>
        <image href={url('desk.png')} width={W} height={H}/>
        <g clipPath="url(#crt)" opacity={glow}>
          <rect x="744" y="154" width="465" height="381" fill="#e9dfcd"/>
          <image href={ROOM} x="748" y="173" width="455" height="338" preserveAspectRatio="xMidYMid meet"/>
          <rect x="749" y="156" width="459" height="377" fill="#5d7b96" opacity=".115"/>
        </g>
      </g>
      <rect width={620} height={H} fill="url(#tv-wall)"/>
    </Canvas>
    <Brand/>
    <Copy x={92} y={222} size={65} style={{opacity: enter(t,.16)}}>1986年</Copy>
    <Copy x={91} y={319} size={39} style={{opacity: enter(t,.6)}}>初代ドラゴンクエスト</Copy>
    <Copy x={93} y={395} size={25} family={sans} weight={550} color={C.muted}
      style={{opacity: enter(t,4.94)}}>冒険が始まる、王さまの部屋。</Copy>
  </>;
}

function Chip({label, active = false}) {
  return <span style={{display:'inline-grid', placeItems:'center', width: 49, height: 49, borderRadius:'50%',
    border: '2px solid '+(active ? '#884615' : '#c4b6a1'), background: active ? '#efbd7d' : '#f6eddb',
    color: '#3b3129', fontFamily: sans, fontWeight: 750, fontSize: 26}}>{label}</span>;
}
function Panel({x, y, width, t, at, children}) {
  const p = enter(t, at, .37);
  return <div style={{position: 'absolute', left: x, top: y, width, opacity: p,
    transform: 'translateY('+((1-p)*9)+'px)', boxSizing: 'border-box',
    padding: '17px 23px 19px', borderRadius: 12,
    background: '#fbf7eb', border: '2px solid #385468', boxShadow: '0 5px 0 #aabbc3, 0 10px 23px #1a304028',
    color:C.ink, fontFamily: sans, fontSize: 26}}>{children}</div>;
}
function Options({x, y, t, at, title, options, selected}) {
  return <Panel {...{x,y,t,at}} width={258}>
    <div style={{fontSize: 17, color: C.muted, marginBottom: 12, fontWeight: 700, letterSpacing: .7}}>{title}</div>
    {options.map(o => <div key={o} style={{fontWeight: o === selected ? 770 : 550,
      padding: '3px 7px 4px 10px', borderLeft: '4px solid '+(o === selected ? C.orange : 'transparent'),
      background: o === selected ? '#f5e4c9' : 'transparent'}}>{o}</div>)}
  </Panel>;
}

function Talk({t}) {
  const p = enter(t, 2.52, .45);
  const dir = enter(t, 7.31, .34);
  const left = enter(t, 10.25, .40);
  const act = enter(t, 12.17, .40);
  return <>
    <Canvas>
      <image href={ROOM} x="110" y="99" width="1220" height="687"/>
      <Hero x={496 - act*22} y={655} size={174} facing={-1} tilt={-2-act*3}/>
      <path d="M442 553q-30-18-70 4m10-17-10 17 21 2"
        opacity={left} stroke={C.orange} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M324 451q18-15 38-9m-33-11 10-13" opacity={act * leave(t,14.5,.85)}
        stroke="#e5b25c" strokeWidth="5" fill="none" strokeLinecap="round"/>
    </Canvas>
    <Brand/>
    <Note x={1139} y={54}>仕組みを示す作画</Note>
    <div style={{position:'absolute',left:771,top:106,opacity:1-p*.42}}><Chip label="A" active={t>1.5 && t<2.9}/></div>
    <Options x={834} y={106} t={t} at={2.25} title="何をする？" options={['はなす','とる','とびら']}
      selected={t >= 5.05 ? 'はなす' : null}/>
    <div style={{opacity: dir}}>
      <Panel x={905} y={427} t={t} at={7.31} width={296}>
        <div style={{fontSize:19, color:C.muted, marginBottom:10}}>どっちに話す？</div>
          <div style={{display:'flex', gap:10}}>{['←','↑','↓','→'].map((a,i) => <span key={a}
          style={{display:'grid', placeItems:'center', width:48,height:42,
            background:i===0&&left>.5?'#f0cf9e':'#ebe7dc', color:i===0&&left>.5?'#612e12':C.ink,
            borderRadius:6,fontWeight:750,fontSize:29}}>{a}</span>)}</div>
          {t >= 11.05 && <div style={{fontSize: 16, color: C.blue, marginTop: 9, fontWeight: 700}}>Aで決める</div>}
      </Panel>
    </div>
    {act > 0 && <Copy x={284} y={267} family={sans} size={26}
      style={{opacity:act, background:'#fbf7eb', border:'2px solid #385468', borderRadius:18,
      padding:'9px 18px', transform:'translateY('+((1-act)*7)+'px)'}}>会話</Copy>}
  </>;
}

function ChestArt({opened}) {
  return <g transform="translate(954 523)">
    {ell(24, 108, 176, 30, .14)}
    <path d="M-147 30L91 30l49-21v75l-46 28h-239z" fill="#b3773a" stroke="#3e382b" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M94 31l46-22v75l-46 28z" fill="#8d532f" stroke="#3b352b" strokeWidth="4"/>
    <path d="M-145 45H93v58h-238z" fill="#dfaa60"/>
    <path d="M-140 60h230m-230 22h230m12-25 34-17m-34 33 32-17" fill="none"
      stroke="#6c492d" strokeWidth="2.8" opacity=".7"/>
    <path d="M-148 32L-100 9H141L94 32z" fill="#312b2a" stroke="#3c342b" strokeWidth="4"/>
    <g transform={'translate(0 8) skewX('+(-opened * 14)+') scale(1 '+(1+opened*.45)+') translate(0 -8) translate(0 '+(-opened * 37)+')'}>
      <path d="M-147 32v-13c0-25 17-44 47-46h195l47 24v18L94 33z" fill="#e6ab55" stroke="#42382c" strokeWidth="4"/>
      <path d="M94 33V18q0-31 48-21v18z" fill="#a36839" stroke="#42382c" strokeWidth="4"/>
      <path d="M-142 4H98m-206-21H115" stroke="#a76837" strokeWidth="2.5" fill="none"/>
      <path d="M-105-25q-20 17-23 56m204-56Q58-8 56 32" stroke="#8e653b" strokeWidth="10" fill="none"/>
      <path d="M-105-25q-20 17-23 56m204-56Q58-8 56 32" stroke="#3f382d" strokeWidth="2.2" fill="none"/>
    </g>
    <path d="M-43 50h39l-4 35h-31z" fill="#eed28d" stroke="#5c472e" strokeWidth="3"/>
    <path d="M-28 66a5 5 0 1 1 9 0l2 9h-13z" fill="#49372d"/>
  </g>;
}
function Chest({t}) {
  const attempt = enter(t, 3.25);
  const failed = enter(t, 3.67, .22) * leave(t, 7.72, .45);
  const jumping = enter(t, 10.64, .75);
  const opened = enter(t, 13.42, .43);
  const key = enter(t, 14.03, .58);
  const hopOff = enter(t, 13.30, .73);
  const feet = 627 - 118*jumping - 88*Math.sin(Math.PI*jumping)
    + 95*hopOff - 35*Math.sin(Math.PI*hopOff);
  return <>
    <Canvas>
      <defs>
        <radialGradient id="spot"><stop stopColor="#fff7e5"/><stop offset="1" stopColor="#f1e8d8"/></radialGradient>
        <linearGradient id="sample-floor" x2="0" y2="1"><stop stopColor="#c3ad89" stopOpacity=".26"/><stop offset="1" stopColor="#b69b72" stopOpacity=".08"/></linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#spot)"/>
      <path d="M155 640l252-155h769l186 155H155z" fill="url(#sample-floor)" stroke="#bba787" strokeWidth="1.9"/>
      <path d="M244 586h1051M344 529h879M505 485l-104 155M629 485l-52 155M765 485l12 155M904 485l85 155M1046 485l159 155"
        stroke="#baa78a" strokeWidth="1.5" fill="none" opacity=".55"/>
      <ChestArt opened={opened}/>
      <Hero x={626 + jumping*325 + hopOff*224} y={feet} size={265}
        tilt={-8*Math.sin(Math.PI*jumping) + pulse(t,5.25,.4)*5}/>
      {key > 0 && <g opacity={key}>
        {ell(945, 403-key*37, 74+12*key, 53+8*key, .29*key, '#f1c66a')}
        <OvalKey x={945} y={410-key*47} scale={1.2} angle={-35+key*11}/>
        <path d="M884 344l-9-11m115-12 5-16m27 31 14-8" stroke="#c86628" strokeWidth="3" opacity={key*.85}
          strokeLinecap="round" fill="none"/>
      </g>}
    </Canvas>
    <Brand/>
    <Note x={1122} y={54}>取扱説明書 p.14</Note>
    <Copy x={108} y={159} size={61}>{t < 8.18 ? '宝箱の、となり。' : '宝箱の、上。'}</Copy>
    {attempt > 0 && t < 8.18 && <Panel x={114} y={333} t={t} at={3.25} width={238}>
      <span style={{fontWeight:760}}>とる</span>
      <span style={{opacity:failed, marginLeft:19, fontSize:19, color:'#a55427'}}>取れない</span>
    </Panel>}
    {t > 11.68 && <Panel x={114} y={333} t={t} at={11.68} width={238}>
      <span style={{fontWeight:760}}>とる</span>
      <span style={{opacity:key, marginLeft:19, fontSize:19, color:C.blue}}>カギ</span>
    </Panel>}
  </>;
}

function Exit({t}) {
  const opening = enter(t, 6.63, 1.42);
  const fields = enter(t, 8.69, .49);
  const key = enter(t,.75,.51)*leave(t,5.85,.36);
  const drift = lerp(t,[4.15,5.73],[0,1]);
  return <>
    <CloseDoor t={t} opening={opening}/>
    <Canvas>
      <OvalKey x={370+drift*783} y={388-drift*16} scale={1.44 - .95*drift} opacity={key}/>
      <image href={FIELDS} width={W} height={H} opacity={fields}
        transform={'translate(720 405) scale('+(1.02 + fields*.014)+') translate(-720 -405)'}/>
    </Canvas>
    <Brand/>
    <div style={{opacity:leave(t,5.85,.48)}}>
      <Options t={t} x={103} y={181} at={1.43} title="扉のそばで" options={['とびら']} selected="とびら"/>
    </div>
  </>;
}

function Reflection({t}) {
  const p = enter(t, .52, .65);
  const final = enter(t, 9.51, .75);
  return <>
    <Canvas>
      <defs><linearGradient id="warm"><stop stopColor={C.paper}/><stop offset="1" stopColor="#eee1c8"/></linearGradient></defs>
      <rect width={W} height={H} fill="url(#warm)"/>
      <image href={ROOM} x="543" y="207" width="810" height="455" opacity={1 - .27*final}/>
      <g opacity={final}>
        <path d="M685 571c94 11 165 32 297 23s244-33 307-70" stroke={C.orange}
          strokeWidth="3.4" strokeDasharray="4 12" fill="none" strokeLinecap="round"/>
        <OvalKey x={1288} y={529} scale={.42} angle={-16}/>
      </g>
    </Canvas>
    <Brand/>
    <Copy x={93} y={166} size={48} style={{opacity:p}}>最初の部屋を出るまでに</Copy>
    <Copy x={94} y={230} size={48} style={{opacity:p}}>遊び方がわかる。</Copy>
    <div style={{position:'absolute',left:98,top:325,width:80*p,height:3,background:C.orange}}/>
    <Copy x={97} y={365} size={21} family={sans} weight={650} color={C.blue} style={{opacity:p}}>
      堀井雄二さんの回想
    </Copy>
    <Copy x={97} y={405} size={19} family={sans} weight={500} color={C.muted} style={{opacity:p}}>
      2017年　電ファミニコゲーマー
    </Copy>
    <Copy x={97} y={535} size={34} style={{opacity:final}}>冒険の入り口は、</Copy>
    <Copy x={97} y={584} size={34} style={{opacity:final}}>小さな練習場でした。</Copy>
  </>;
}
function Credits({t}) {
  return <>
    <Canvas><image href={FIELDS} x="778" width="662" height={H} preserveAspectRatio="xMidYMid slice"/>
      <rect width="779" height={H} fill={C.paper}/>
      <path d="M97 245h71" fill="none" stroke={C.orange} strokeWidth="3"/>
      <OvalKey x={700} y={666} scale={.46} angle={-26} opacity={enter(t,.05,.55)}/>
    </Canvas>
    <Brand/>
    <Copy x={94} y={150} size={48}>出典と制作</Copy>
    <Copy x={98} y={288} size={25} family={sans} weight={610}>ファミコン版『ドラゴンクエスト』取扱説明書</Copy>
    <Copy x={98} y={331} size={20} family={sans} color={C.muted} weight={500}>エニックス　pp. 10–11、13–14</Copy>
    <Copy x={98} y={403} size={24} family={sans} weight={610}>堀井雄二インタビュー</Copy>
    <Copy x={98} y={445} size={20} family={sans} color={C.muted} weight={500}>電ファミニコゲーマー　2017年</Copy>
    <Copy x={98} y={608} size={20} family={sans} color={C.muted} weight={530}>
      ナレーション　VOICEVOX 青山龍星
    </Copy>
    <Copy x={98} y={645} size={20} family={sans} color={C.muted} weight={530}>画と効果音　Plunode制作</Copy>
  </>;
}

const scenes = {door: Intro, memory: Memory, talk: Talk, chest: Chest, exit: Exit, sources: Reflection, end: Credits};
function Captions({cue}) {
  if (!cue) return null;
  return <div style={{position:'absolute', inset:'auto 0 0', minHeight:91, display:'grid', placeItems:'center',
    boxSizing:'border-box', padding:'14px 84px 16px', background:C.ink, color:'#fff9ef',
    whiteSpace:'pre-line', textAlign:'center', lineHeight:1.3, fontFamily:sans, fontWeight:625,
    letterSpacing:.1, fontSize:38}}>{cue.text}</div>;
}

function Film() {
  const [handle] = useState(() => delayRender('Decode the illustrated plates'));
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  useEffect(() => {
    Promise.all([ROOM, HERO, FIELDS, url('desk.png')].map(async src => {
      const plate = new window.Image();
      plate.src = src;
      await plate.decode();
    })).then(() => continueRender(handle), cancelRender);
  }, [handle]);
  const sec = frame / fps;
  const scene = timing.scenes.find(s => sec >= s.start && sec < s.end) ?? timing.scenes.at(-1);
  const cue = scene.cues.find(c => sec >= c.start && sec < c.end);
  const Shot = scenes[scene.id];
  return <AbsoluteFill style={{background:C.paper}}>
    <Audio src={url('sound.mp3')}/>
    <div style={{width:W, height:H, position:'absolute', transformOrigin:'top left', transform:'scale('+ width/W +')',
      overflow:'hidden', background:C.paper}}>
      <Shot t={sec - scene.start}/>
      <Captions cue={cue}/>
    </div>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="DragonQuest" component={Film} width={1920} height={1080}
  durationInFrames={timing.durationFrames} fps={timing.fps}/>);
