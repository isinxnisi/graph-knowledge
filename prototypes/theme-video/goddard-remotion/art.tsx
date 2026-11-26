import React from 'react';

const INK = '#213840';
const PAPER = '#f5efe1';
const GROUND = '#e6dfcc';

const shades = [
  ['#486d66', '#809174', '#658776', '#91a281', '#acc09b'],
  ['#406764', '#749481', '#537f77', '#8da490', '#b3bf9e'],
  ['#577367', '#82927b', '#6f8a73', '#9a9d7d', '#c3bf95'],
];

type CabbageProps = {
  x?: number;
  y?: number;
  scale?: number;
  tilt?: number;
  variant?: number;
};

export const Cabbage = ({x = 0, y = 0, scale = 1, tilt = 0, variant = 0}: CabbageProps) => {
  const [shade, leaf, outer, head, vein] = shades[((variant % 3) + 3) % 3] ?? shades[0];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path fill="#5b6559" opacity=".24" d="M-108 6C-64-6-21-8 25-7c39 1 70 4 95 11C86 17 24 21-19 17-60 19-90 15-108 6Z" />
      <g transform={`rotate(${tilt})`} stroke={INK} strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round">
        {/* The low leaves carry the weight of the folded head. */}
        <path fill={shade} d="M-1-18C-31-19-64-35-67-58c-22-8-42-30-41-49 5-8 24-1 39-5-6-7-12-24-3-30s19 9 29 10c6-18 26-21 35-5 12 12 19 30 32 39 10-12 19-33 35-44 10-6 21 0 20 10 11-1 22-8 30-2 8 8 1 18-8 29 11 7 9 16 0 24-17 18-43 29-60 43Z" />
        <path fill={leaf} d="M-31-6C-52 0-79-5-99-17c-14-2-18-9-19-20 2-8 12-9 22-9-12-4-25-21-17-30 5-6 13-1 19-1 2-10 10-12 21-8 27 9 49 31 70 54Z" />
        <path fill={outer} d="M33-16c13-20 27-44 48-55 10-7 22-6 26 2 17-1 23 8 13 22 6 11-1 17-15 24-11 14-41 23-66 18Z" />
        <path fill={head} d="M-17-10c-27-8-51-26-54-54-4-29 15-53 35-59 5-11 25-18 37-14 11-5 28 1 36 10 20 3 37 22 40 42 9 17 1 42-8 55-9 16-31 31-52 33Z" />
        <path fill={leaf} d="M-46-101c-13 8-15 24-11 41 5 22 22 37 40 42-1 6 1 12 3 16-22-1-48-15-63-29-20-13-21-39-10-48 7-5 13-2 17-1 8-13 12-18 24-21Z" />
        <path fill={outer} d="M32-22c11-12 33-30 43-41 8-9 12-13 20-13 5 0 6 8 5 11-11 11-17 19-15 31-4 19-28 36-55 39-13 2-34 0-42-6 20-8 28-9 44-21Z" />
        <path fill={head} d="M-27-5c-9-10-8-29-1-40-10-5-13-17-9-24 4-6 11-8 16-5-5-11-2-26 9-25 7 0 12 9 19 12 11-5 26-2 26 9 16-1 24 12 15 25 5 19-1 32-16 44C17 4-12 8-27-5Z" />

        {/* Broad veins and imperfect short cuts keep the texture readable at a distance. */}
        <g fill="none" stroke={vein} strokeWidth="2.6">
          <path d="M-48-19c-16-9-34-24-46-44m29 30c-8-1-17-3-23-8m35 17c-1-9-5-18-9-22m90 49c24-7 46-24 62-47M60-14c7-2 21-4 28-11M51-11c6-7 7-16 11-24" />
          <path d="M10-7C4-27 11-47 7-72 1-80-8-84-12-89M8-42c-10-7-23-10-32-12m34 5c5-6 15-8 22-13M7-26c8-4 18-5 24-11m-30 5c-8-2-12-6-16-10" />
          <path d="M-20-122c-9 8-11 20-13 29m83-26c9 8 11 15 14 24m-74-28 6-8m24 10 1-8m16 14 4-3M-68-63c-2 8 1 18 7 24m-15 3 6 9m50 12 4 6m51-12 6-7" />
        </g>
        <g fill="none" stroke="#334f4d" strokeWidth="1.55" opacity=".75">
          <path d="m-95-93 8 7m-4-15 11 8m37-40 7 7m-2-12 6 7m114 4-9 8m14-4-8 7m15 73-5 8m18-18-5 8m-27 26-7 3m-108-3 7 3m-33-11 7 4m-2 5 9 3m50 11h7" />
        </g>
      </g>
    </g>
  );
};

const flecks = Array.from({length: 125}, (_, i) => {
  const x = (i * 467.3 + 17.9) % 1597;
  const y = (i * 197.6 + 11.3) % 895;
  return {x, y, length: (i * 7.9) % 4.2 + 1, angle: i % 2 === 0 ? 1 : -1};
});

const plants = [
  {x: 105, y: 636, scale: .18, tilt: -9, variant: 2},
  {x: 239, y: 641, scale: .22, tilt: 4, variant: 1},
  {x: 403, y: 649, scale: .29, tilt: -6, variant: 0},
  {x: 594, y: 668, scale: .34, tilt: 8, variant: 2},
  {x: 776, y: 710, scale: .51, tilt: -7, variant: 1},
  {x: 1481, y: 679, scale: .37, tilt: 8, variant: 0},
];

export const Field = ({variant = 'opening'}: {variant?: 'opening' | 'flight'}) => {
  const opening = variant === 'opening';
  const horizon = opening ? 630 : 650;
  return (
    <g>
      <rect width="1600" height="900" fill={PAPER} />
      <g transform={`translate(0 ${horizon - 630})`}>
        <path fill="#d7ddd0" d="M0 594c88-17 190-29 294-24 102 3 176 25 263 25 87-1 172-33 289-40 80-6 172 9 250 15 79 6 137-29 227-30 101-2 174 19 277 25v88H0Z" />
        <path fill="#b8c5b0" d="M0 605c151-12 191-32 281-27 79 4 157 22 215 23 85 2 162-10 255-28 56-10 128-11 192 0 78 12 155 27 238 13 163-28 296 5 419 7v56H0Z" />
        <path fill="#a0b29e" d="M0 617c118-8 224-5 339-7 94-2 155 9 232 6 71-3 147-14 243-16 103-2 153 6 237 7 99 0 161-12 253-10 93 2 179 5 296 12v72H0Z" />
        <path fill={GROUND} d="M0 629c107-1 214-4 307-3 120 1 218 4 321 5 527 0 756-8 972 2v270H0Z" />
        <path fill="#f1eade" opacity=".88" d="M0 647c143-12 408-17 520-7 280 23 340 75 545 122 167 37 344 45 535 40v30c-241 13-431-1-594-51-355-107-552-109-1006-117Z" />
        <path fill="#b9997a" opacity=".55" d="M0 672c272-9 493 4 663 24 151 18 236 56 359 92 182 53 440 50 578 38v16c-178 16-431 10-597-39-153-45-217-70-370-84-226-21-393-27-633-29Zm0 84c151-18 337-15 515 4 125 14 225 43 343 75 107 28 200 49 308 74h-96c-193-49-410-111-578-125-201-18-347-15-492 1Z" />
        <path fill="#d0b697" d="M0 804c139-18 264-19 409-1 113 14 246 46 382 97h-74c-116-35-222-62-322-73-128-14-267-8-395 10Z" />
        <g fill="none" stroke="#658879" strokeWidth="2.4" opacity=".58" strokeLinecap="round">
          <path d="M47 622c52-4 102-6 161-5m84 2c46 1 80 2 111 5m677-15c37-1 66 1 108 1m85-5 82 1m112 10 102 7M31 607l5-6 7 4m8-1 2-5 7 4m140-10 10-7 9 5m1101 0 4-7 6 5m11 2 5-8 6 6" />
        </g>
      </g>
      {flecks.map(({x, y, length, angle}, index) => (
        <path
          key={index}
          d={`M${x} ${y}l${length} ${angle * .65}`}
          fill="none"
          stroke={y < horizon ? '#998b6c' : '#745e4f'}
          strokeWidth=".85"
          opacity={y < horizon ? .19 : .28}
        />
      ))}
      {opening ? plants.map((plant) => <Cabbage key={plant.x} {...plant} />) : (
        <g>
          <Cabbage x={161} y={650} scale={.17} tilt={-7} />
          <Cabbage x={233} y={652} scale={.22} tilt={5} variant={2} />
          <Cabbage x={351} y={657} scale={.26} tilt={-3} variant={1} />
          <Cabbage x={420} y={653} scale={.18} tilt={9} />
          <Cabbage x={519} y={653} scale={.13} variant={2} />
        </g>
      )}
    </g>
  );
};
