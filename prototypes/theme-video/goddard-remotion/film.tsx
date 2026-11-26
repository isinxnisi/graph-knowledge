import React from 'react';
import {AbsoluteFill, Audio, Composition, Easing, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Cabbage, Field} from './art';
import captions from './public/captions.json';

const paper = '#f3eddf';
const ink = '#263635';
const teal = '#3d6662';
const rust = '#ad542f';
const warm = '#e6a557';
const serif = 'Noto Serif JP, Yu Mincho, Georgia, serif';
const sans = 'Noto Sans JP, Yu Gothic, sans-serif';
const flightStart = 31.2;
const flightEnd = 33.7;
const flightPosition = (progress: number) => ({
  x: 1310 - 1000 * progress ** 1.85,
  y: 650 - 226 * Math.sin(Math.PI * progress ** .86),
});
const tracedFlight = Array.from({length: 33}, (_, point) => {
  const {x, y} = flightPosition(point / 32);
  return `${x},${y - 32}`;
}).join(' ');

const ease = (time: number, from: number, to: number) => interpolate(time, [from, to], [0, 1], {
  easing: Easing.bezier(0.22, 0.62, 0.36, 1),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

const Label = ({x, y, children, size = 24, fill = teal, anchor = 'start'}: {
  x: number; y: number; children: React.ReactNode; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end';
}) => <text x={x} y={y} fontFamily={sans} fontWeight={600} fontSize={size} textAnchor={anchor} fill={fill}>{children}</text>;

const Title = ({x, y, children, size = 84, fill = ink}: {
  x: number; y: number; children: React.ReactNode; size?: number; fill?: string;
}) => <text x={x} y={y} fontFamily={serif} fontSize={size} fontWeight={650} fill={fill}>{children}</text>;

// The origin of the drawing is the bottom of the rocket. The two dark feet belong to the launch stand.
const Stand = ({x, y, scale = 1}: {x: number; y: number; scale?: number}) =>
  <g transform={`translate(${x} ${y}) scale(${scale})`} strokeLinecap="round" strokeLinejoin="round" fill="none">
    <path d="M -97 4 L -43 -290 L 51 -289 L 96 4 M -76 -68 L 81 -68 M -65 -126 L 70 -126 M -43 -290 L -2 -316 L 50 -289 M -63 -122 L 82 -68 L -90 -16 M 68 -124 L -82 -64 L 90 -15" stroke="#627172" strokeWidth={7}/>
    <path d="M -97 4 L -43 -290 L 51 -289 L 96 4 M -76 -68 L 81 -68 M -65 -126 L 70 -126" stroke="#324542" strokeWidth={2.5}/>
    <path d="M -118 5 L -77 5 M 77 5 L 120 5" stroke="#384b47" strokeWidth={6}/>
    <path d="M -43 -282 L -52 -224 M 76 -106 L 84 -58 M -68 -72 L -20 -71" stroke="#ebe3ca" strokeWidth={2} opacity={0.6}/>
  </g>;

const Rocket = ({x, y, scale = 1, angle = 0, flame = 0, moment = 0}: {
  x: number; y: number; scale?: number; angle?: number; flame?: number; moment?: number;
}) => <g transform={`translate(${x} ${y}) scale(${scale}) rotate(${angle} 1 -133)`} strokeLinejoin="round">
  {flame > 0 && <g stroke="none" opacity={flame}>
    <path d={`M -13 -230 Q -20 -207 0 ${-192 + 7 * Math.sin(moment * 39)} Q 18 -209 14 -230 Z`} fill={warm}/>
    <path d="M -7 -234 Q -13 -215 1 -203 Q 13 -216 8 -232 Z" fill="#f5dac1"/>
  </g>}
  <path d="M -11 -227 L -28 -14 M 12 -227 L 29 -14 M -12 -222 L 15 -194 M 13 -222 L -18 -183"
    fill="none" stroke="#444d46" strokeWidth={5}/>
  <path d="M -18 -253 Q -17 -278 -1 -281 Q 17 -278 19 -253 L 18 -231 L -18 -231 Z" fill="#aa532f" stroke={ink} strokeWidth={4}/>
  <path d="M -11 -253 L -11 -268 M 13 -244 L 12 -253" fill="none" stroke="#f3bc7e" strokeWidth={3}/>
  <path d="M -40 -55 Q -39 -67 -24 -69 Q -10 -66 -10 -55 L -10 -18 Q -17 -8 -27 -9 Q -42 -13 -42 -22 Z" fill="#77908a" stroke={ink} strokeWidth={4}/>
  <path d="M 9 -61 Q 17 -73 29 -69 Q 41 -66 41 -54 L 41 -19 Q 34 -9 23 -8 Q 10 -12 7 -22 Z" fill="#a1aaa1" stroke={ink} strokeWidth={4}/>
  <path d="M -36 -26 L -34 -51 M 14 -26 L 16 -54 M -43 -40 L -9 -39 M 9 -40 L 41 -39" fill="none" stroke="#d3cdb6" strokeWidth={2.5}/>
  <path d="M -52 -9 L 49 -9 M -45 -3 L 38 -3" stroke={ink} strokeWidth={4} strokeLinecap="round"/>
</g>;

const Miles = ({time}: {time: number}) => {
  const p = Math.min(1, Math.max(0, (time - flightStart) / (flightEnd - flightStart)));
  // The sources give endpoints and duration. The arc is illustrative.
  const {x, y} = flightPosition(p);
  const flown = time >= flightEnd;
  const finished = ease(time, 34.05, 34.75);
  const landed = ease(time, flightEnd, flightEnd + .8);
  return <>
    <Field variant="flight"/>
    <Stand x={1310} y={650} scale={.32}/>
    {!flown && <Rocket x={x} y={y} scale={.27}
      angle={-94 * ease(time, flightStart + .2, flightEnd - .32)} flame={.48} moment={time}/>}
    {flown && <polyline points={tracedFlight} fill="none" stroke="#ba663e" strokeWidth="3"
      strokeDasharray="6 13" opacity={.47 * finished}/>}
    {flown && <g transform="translate(311 647) rotate(-9)">
      <path d="M -27 0 L 27 0 M -8 -14 L 28 -16 M -20 -6 L 19 -20" stroke={ink} strokeWidth="4" strokeLinecap="round"/>
      <path d="M -10 -19 l -10 -23 m 37 23 l 15 -19" stroke={rust} strokeWidth="2" opacity={1 - landed}/>
    </g>}
    <Cabbage x={264} y={673} scale={.29} tilt={flown ? 11 * Math.sin(landed * 10) * (1 - landed) : 0} variant={1}/>
    <Cabbage x={355} y={668} scale={.27} variant={2}/>
    <g opacity={finished}>
      <path d="M 310 702 H 1310 M 310 687 v 30 M 1310 687 v 30" stroke={teal} strokeWidth={2}/>
      <rect x="674" y="673" width="252" height="56" rx="5" fill={paper}/>
      <Title x={717} y={713} size={38}>約 56 m</Title>
      <Label x={1308} y={744} anchor="end" size={20}>架台</Label>
      <Label x={310} y={744} anchor="middle" size={20}>着地点</Label>
      <text x="112" y="245" fontFamily="Georgia, serif" fontSize="134" fill={ink}>2.5</text>
      <Label x={305} y={243} size={33} fill={ink}>秒</Label>
    </g>
    <Label x={1467} y={90} size={23} anchor="end">飛行の模式図</Label>
  </>;
};

const Opening = ({time, ending = false}: {time: number; ending?: boolean}) => {
  const grow = ending ? 1 : .98 + .02 * ease(time, 0, 2.2);
  return <>
    <Field/>
    {ending && <g transform="translate(1208 588) rotate(-18)" opacity={.94}>
      <path d="M -32 2 L 51 -18 L 120 -32 M -44 -15 L 105 -39 M 2 14 L 64 -13" stroke={ink} strokeWidth={9} fill="none" strokeLinecap="round"/>
      <path d="M 114 -48 Q 146 -55 155 -35 Q 154 -24 119 -22 L 111 -26 Z" fill={rust} stroke={ink} strokeWidth={5}/>
    </g>}
    <Cabbage x={1112} y={674} scale={2.48 * grow} tilt={-.6 + .65 * Math.sin(time * 1.7)}/>
    <Title x={116} y={281} size={ending ? 66 : 94}>{ending ? '行き先、' : 'キャベツ畑まで、'}</Title>
    <Title x={116} y={ending ? 391 : 428} size={ending ? 86 : 130} fill={rust}>{ending ? 'キャベツ畑。' : '2.5 秒。'}</Title>
  </>;
};

const Farm = ({time}: {time: number}) => <>
  <Field variant="flight"/>
  <Stand x={1107} y={660} scale={1.43}/>
  <Rocket x={1107} y={576} scale={1.1}/>
  <path d="M 120 286 H 641" stroke={rust} strokeWidth="2"/>
  <Label x={122} y={259} size={25} fill={rust}>アメリカ、マサチューセッツ州</Label>
  <Title x={117} y={391} size={70}>1926年3月16日</Title>
  <Title x={122} y={480} size={43}>オーバーンの農場</Title>
  <g opacity={ease(time, 7.1, 7.9)}><Label x={1434} y={96} size={22} anchor="end">発射前の模式図</Label></g>
</>;

const CloseUp = ({time}: {time: number}) => {
  const ignition = ease(time, 24.58, 24.87);
  const engine = ease(time, 18.58, 19.14);
  const tank = ease(time, 20.7, 21.32);
  const notes = 1 - ease(time, 23.35, 24);
  return <>
    <rect width="1600" height="900" fill={paper}/>
    <circle cx="844" cy="454" r="305" fill="#e7e8dc"/>
    <path d="M 527 751 Q 808 745 1082 754" fill="none" stroke="#b9b8a8" strokeWidth="2"/>
    <Stand x={829} y={738} scale={1.96}/>
    <Rocket x={830} y={638} scale={1.62} flame={ignition * .88} moment={time}/>
    <g opacity={notes}>
      <g opacity={engine}><path d="M 868 207 L 1035 207 L 1084 232 H 1180" fill="none" stroke={rust} strokeWidth="2"/><circle cx="867" cy="207" r="4" fill={rust}/><Label x={1201} y={241} size={29} fill={rust}>エンジン</Label></g>
      <g opacity={tank}><path d="M 758 561 H 614 L 563 586 H 363" fill="none" stroke={teal} strokeWidth="2"/><circle cx="758" cy="561" r="4" fill={teal}/><Label x={348} y={594} anchor="end" size={29}>燃料のタンク</Label></g>
    </g>
    <Label x={1467} y={90} size={23} anchor="end">機体の模式図</Label>
  </>;
};

const Diary = ({time}: {time: number}) => {
  const edge = ease(time, 42.2, 42.78);
  const quote = ease(time, 48.96, 49.58);
  const dancer = ease(time, 52.97, 53.6);
  return <>
    <rect width="1600" height="900" fill="#dee4da"/>
    <path d="M 590 0 L 550 900" stroke="#c9d1c6" strokeWidth="2"/>
    <Label x={111} y={267} size={24} fill={rust}>翌日の日記</Label>
    <Title x={108} y={347} size={48}>ロバート・</Title>
    <Title x={106} y={418} size={48}>ゴダード</Title>
    <path d="M 114 453 H 369" stroke="#a65735" strokeWidth="2"/>
    <Label x={113} y={506}>1926年3月17日</Label>
    <Label x={113} y={548} size={19}>クラーク大学所蔵</Label>
    <g transform={`translate(${21 * (1 - edge)} 0)`} opacity={edge}>
      <path d="M 607 123 Q 856 97 1082 135 Q 1306 106 1519 111 L 1510 723 Q 1277 722 1082 749 Q 861 713 608 760 Z" fill="#667768" opacity=".20"/>
      <path d="M 598 112 Q 856 81 1082 124 Q 1306 96 1508 106 L 1499 711 Q 1277 707 1082 735 Q 861 700 599 745 Z" fill="#f6eedb" stroke="#c4b7a0" strokeWidth="2"/>
      <path d="M 1082 124 V 735 M 1075 125 V 731" stroke="#d4c8b2" strokeWidth="2"/>
      <path d="M 632 200 Q 856 180 1031 214 M 635 239 Q 819 221 1030 253 M 637 276 Q 835 267 1030 290 M 1129 227 Q 1255 198 1457 205 M 1131 263 Q 1261 242 1462 244" fill="none" stroke="#b2a991" strokeWidth="2" opacity={.45}/>
      <g opacity={quote}><Title x={653} y={427} size={55}>「そろそろ、</Title><Title x={694} y={500} size={54}>よそへ行きますね」</Title><Label x={1198} y={633} size={20}>日記の趣旨</Label></g>
      <path d="M 1242 434 Q 1455 353 1376 251 Q 1317 202 1242 261" fill="none" stroke={rust} strokeDasharray="5 12" strokeWidth="3" opacity={dancer * .62}/>
      <g opacity={dancer}><Rocket x={1261} y={445} scale={.48} angle={-34} /><path d="M 1359 319 l 14 -11 m -10 41 l 20 -5" stroke={rust} strokeWidth="2"/></g>
    </g>
  </>;
};

const Credits = () => <>
  <rect width="1600" height="900" fill={paper}/>
  <Cabbage x={1296} y={674} scale={1.45} tilt={-10} variant={1}/>
  <Title x={114} y={273} size={65}>この話の出典</Title>
  <path d="M 119 316 H 1071" stroke={rust} strokeWidth="2"/>
  <Label x={119} y={374} size={28} fill={ink}>ゴダードの日記　1926年3月17日</Label>
  <Label x={119} y={418} size={22}>クラーク大学所蔵</Label>
  <Label x={119} y={498} size={28} fill={ink}>NASA　初の液体燃料ロケット飛行の記録</Label>
  <Label x={119} y={608} size={22}>作画・効果音は番組制作　　音声 VOICEVOX:青山龍星</Label>
</>;

const Art = ({t}: {t: number}) => {
  if (t < 6.05) return <Opening time={t}/>;
  if (t < 12.8) return <Farm time={t}/>;
  if (t < 29.85) return <CloseUp time={t}/>;
  if (t < 42.2) return <Miles time={t}/>;
  if (t < 58.65) return <Diary time={t}/>;
  if (t < 66.6) return <Opening time={t} ending/>;
  return <Credits/>;
};

const Film = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const caption = captions.find(({start, end}) => t >= start && t < end);
  return <AbsoluteFill style={{background: paper}}>
    <svg viewBox="0 0 1600 900" width="100%" height="100%" style={{position: 'absolute'}}>
      <defs>
        <pattern id="paper-specks" width="83" height="61" patternUnits="userSpaceOnUse">
          <path d="M 2 24 l 2 .3 M 35 9 l 2 .5 M 51 45 l 1 .4 M 79 28 l 2 .2 M 17 56 l 1 .3 M 57 4 l 2 .4 M 48 28 l 1 .4 M 23 31 l 2 .2" stroke="#655d43" strokeWidth=".85" opacity=".25"/>
        </pattern>
      </defs>
      <Art t={t}/>
      <rect width="1600" height="900" fill="url(#paper-specks)" pointerEvents="none"/>
      <g transform="translate(116 92)">
        <path d="M 0 1 L 17 -8" stroke={rust} strokeWidth="3" strokeLinecap="round"/>
        <circle cx="0" cy="1" r="4" fill={rust}/>
        <circle cx="17" cy="-8" r="4" fill={rust}/>
        <text x="30" y="4" fill={ink} fontSize="31" style={{fontFamily: 'Georgia, serif'}}>Plunode</text>
      </g>
      {(t < 6.05 || (t >= 58.65 && t < 66.6)) && <Label x={1467} y={90} size={23} anchor="end">番組の作画</Label>}
    </svg>
    {caption && <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, background: '#233734',
      color: '#fff7e9', minHeight: '11%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      whiteSpace: 'pre-line', textAlign: 'center', padding: '0 5%', letterSpacing: '.015em', lineHeight: 1.33,
      fontFamily: sans, fontSize: 38, fontWeight: 600,
    }}>{caption.text}</div>}
    <Audio src={staticFile('sound.wav')}/>
  </AbsoluteFill>;
};

registerRoot(() => <Composition id="CabbageFlight" component={Film} width={1920} height={1080} fps={24} durationInFrames={24 * 71}/>);
