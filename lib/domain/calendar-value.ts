/** Civil date/clock precision is retained verbatim. An absent offset is not UTC. */
const format = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2})(?::(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/;
export function calendarValue(value: string) {
  const match = format.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, sec, zone] = match;
  const year=Number(y), month=m?Number(m):1, day=d?Number(d):1;
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=(n:number)=>n===2?leap?29:28:[4,6,9,11].includes(n)?30:31;
  if (!year||month<1||month>12||day<1||day>days(month)||Number(h)>23||Number(min)>59||Number(sec)>59) return null;
  if (zone&&zone!=="Z") { const [zh,zm]=zone.slice(1).split(":").map(Number); if(zh>14||zm>59||(zh===14&&zm!==0))return null; }
  const precision=sec!==undefined?"second":min!==undefined?"minute":h!==undefined?"hour":d?"day":m?"month":"year";
  const coordinate=(mo:number,da:number,hour=0,minute=0,second=0)=>{
    if (!zone) return year*10000+mo*100+da+(hour*3600+minute*60+second)/86400;
    const date=new Date(0);date.setUTCFullYear(year,mo-1,da);date.setUTCHours(hour,minute,second,0);
    const offset=zone==="Z"?0:(zone[0]==="-"?-1:1)*(Number(zone.slice(1,3))*60+Number(zone.slice(4)));
    date.setUTCMinutes(date.getUTCMinutes()-offset);
    return date.getUTCFullYear()*10000+(date.getUTCMonth()+1)*100+date.getUTCDate()+(date.getUTCHours()*3600+date.getUTCMinutes()*60+date.getUTCSeconds())/86400;
  };
  const start=coordinate(month,day,Number(h??0),Number(min??0),Number(sec??0));
  const end=h!==undefined?coordinate(month,day,Number(h),Number(min??59),Number(sec??59)):coordinate(m?month:12,d?day:days(m?month:12));
  return {year,month,day,precision,zone:zone??null,basis:zone?"offset":"civil",bounds:[start,end] as [number,number]};
}
export const calendarBounds=(value:string):[number,number]=>calendarValue(value)?.bounds??[NaN,NaN];
