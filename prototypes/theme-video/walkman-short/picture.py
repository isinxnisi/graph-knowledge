"""Portrait edit of the original Plunode drawings. All coordinates use a 720 × 1280 stage."""
import copy
import io
import math
from functools import lru_cache
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import resvg_py

HERE = Path(__file__).resolve().parent
ART = HERE.parent / "walkman/figures/listen.svg"
PAPER = "#f6f0e5"
INK = "#172d3b"
BLUE = "#245b78"
ORANGE = "#dd8040"
GOLD = "#fac183"
MUTED = "#526a70"
TEAL = "#bcd3c9"
CREAM = "#fff5dd"
WIDTH, HEIGHT = 720, 1280
FPS = 30

@lru_cache(None)
def font(size, face):
    name = {"serif":"yumindb.ttf", "goth":"YuGothB.ttc", "book":"georgia.ttf", "ital":"georgiai.ttf"}[face]
    return ImageFont.truetype(str(Path("C:/Windows/Fonts") / name),size)

@lru_cache(None)
def label(value,size,face,color):
    f=font(size,face)
    x,y,r,b=f.getbbox(value)
    im=Image.new("RGBA",(max(1,r-x+4),b-y+4))
    ImageDraw.Draw(im).text((2-x,2-y),value,font=f,fill=color,stroke_width=0)
    return im

def text(im,value,x,y,size=36,face="serif",color=INK,center=False):
    layer=label(value,size,face,color)
    im.paste(layer,(round(x-layer.width/2 if center else x),round(y)),layer)

def ease(t,a,b):
    p=max(0,min(1,(t-a)/(b-a)))
    return p*p*(3-2*p)

@lru_cache(None)
def sprite(name):
    root=ET.parse(ART).getroot()
    group=copy.deepcopy(root.find(f".//*[@id='{name}']"))
    group.attrib.pop("transform",None)
    for el in list(root):
        if not el.tag.endswith("defs"): root.remove(el)
    # The orange key is its own animated piece in this edit.
    if name=="player":
        group.remove(list(group)[-1])
    root.append(group)
    group.set("stroke-linejoin","round")
    group.set("stroke-linecap","round")
    box=(439,305,126,157) if name=="player" else (0,0,300,340)
    root.set("viewBox"," ".join(map(str,box)))
    root.set("width",str(box[2]*4)); root.set("height",str(box[3]*4))
    data=resvg_py.svg_to_bytes(svg_string=ET.tostring(root,encoding="unicode"),skip_system_fonts=True)
    result=Image.open(io.BytesIO(data)).convert("RGBA")
    return result.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if name=="right-listener" else result

@lru_cache(64)
def resized(name,w,h):
    return sprite(name).resize((w,h),Image.Resampling.LANCZOS)

def art(im,name,x,y,w,h):
    obj=resized(name,round(w),round(h))
    im.paste(obj,(round(x),round(y)),obj)

def curve(points,n=90):
    a,b,c,d=(np.array(p) for p in points)
    return [tuple(np.round((1-k)**3*a+3*(1-k)**2*k*b+3*(1-k)*k*k*c+k**3*d).astype(int)) for k in np.linspace(0,1,n)]

def line(d,xy,color,width=2):
    d.line(xy,fill=color,width=width,joint="curve")

def dot(d,x,y,r,color):
    d.ellipse((x-r,y-r,x+r,y+r),fill=color)

def deck(im,x,y,scale,t,down):
    d=ImageDraw.Draw(im)
    art(im,"player",x,y,126*scale,157*scale)
    def pos(px,py):return (x+(px-439)*scale,y+(py-305)*scale)
    k=3*down
    shape=[pos(px,py+k) for px,py in [(532,320),(532,315),(535,312),(546,312),(547,318),(543,321)]]
    d.polygon(shape,fill=ORANGE)
    line(d,shape+[shape[0]],INK,max(2,round(1.7*scale)))
    for cx in (478,512):
        xx,yy=pos(cx,385)
        for i in range(3):
            angle=t*2.9+i*2*math.pi/3
            dot(d,xx+math.cos(angle)*4.6*scale,yy+math.sin(angle)*4.6*scale,.85*scale,INK)

def header(im,dark=False):
    d=ImageDraw.Draw(im); fg=CREAM if dark else INK
    line(d,[(51,75),(73,63)],ORANGE,3)
    dot(d,51,75,5,ORANGE);dot(d,73,63,5,ORANGE)
    text(im,"Plunode",86,52,35,"book",fg)
    text(im,"TPS–L2   /   1979",434,68,23,"book",TEAL if dark else MUTED)
    line(d,[(48,110),(664,110)],"#48606b" if dark else "#d7cec0",1)

def pair(im,t,speaking=False):
    d=ImageDraw.Draw(im)
    beat=2*math.pi*(t-1.55)/.48
    lnod=(1+math.cos(beat))*(3.6 if t>15.55 else 1.4)
    rnod=(1+math.cos(beat-.42))*2.1
    scale=1.02
    x1,y1=4,425+lnod
    x2,y2=374,413+rnod
    art(im,"left-listener",x1,y1,300*scale,340*scale)
    art(im,"right-listener",x2,y2,300*scale,340*scale)
    player_x,player_y,ps=246,778,1.65
    # The two leads run from the ear cups to the two jacks; the coloured pulse stays on the lead.
    for side in (0,1):
        if side==0:
            ear=(x1+117*scale,y1+159*scale)
            p=curve([ear,(91,937),(222,949),(251,829)])+curve([(251,829),(272,748),(299,749),(player_x+39*ps,player_y+9*ps)])
        else:
            ear=(x2+182*scale,y2+159*scale)
            p=curve([ear,(602,925),(461,942),(439,831)])+curve([(439,831),(408,750),(392,752),(player_x+77*ps,player_y+9*ps)])
        line(d,p,PAPER,9)
        line(d,p,BLUE,5)
        if speaking:
            for j in (0,.5):
                loc=int(((1-(t*1.21+j)%1))*(len(p)-1))
                line(d,p[max(0,loc-12):loc+1],ORANGE,7)
    if 4.9<t<6.5 or 12.25<t<15.05:
        # Animate at the speaker's mouth, distinct from the pulse emerging from the deck.
        mouth=(x2+(300-214)*scale,y2+157*scale)
        flap=max(0,math.sin(t*19)*math.cos(t*6))
        if flap>.12:
            xx,yy=mouth
            d.ellipse((xx-5,yy-1,xx+6,yy+flap*4),fill="#754b41")
    if 18.2<t<21.8:
        path=curve([(x2+78*scale,y2+158*scale),(412,634),(336,676),(player_x+57*ps,player_y+20*ps)])
        for i in range(4):
            idx=int(((t*.84+i/4)%1)*(len(path)-1))
            dot(d,*path[idx],3.5,ORANGE)
    deck(im,player_x,player_y,ps,t,1 if speaking else 0)

def caption(im,rows,sub=None):
    for i,row in enumerate(rows):
        text(im,row,347,1052+i*43,33,"goth",INK,True)
    if sub: text(im,sub,347,1174,22,"goth",MUTED,True)

def bubble(im,x,y,words,tail,fill=CREAM):
    d=ImageDraw.Draw(im)
    width=label(words,37,"serif",INK).width+58
    h=81;x=int(x-width/2)
    d.rounded_rectangle([x,y,x+width,y+h],radius=32,fill=fill,outline=INK,width=3)
    tip=x+width*(.76 if tail>0 else .24)
    d.polygon([(tip-12,y+h-4),(tip+14,y+h-4),(tip+tail*16,y+h+21)],fill=fill)
    line(d,[(tip-12,y+h-1),(tip+tail*16,y+h+21),(tip+14,y+h-1)],INK,3)
    text(im,words,x+width/2,y+19,37,"serif",INK,True)

def wave(im,x,y,width,t,color,amp=1):
    d=ImageDraw.Draw(im)
    for i in range(33):
        h=(3+20*abs(math.sin(i*.79+t*9)*math.cos(i*.22-t*4)))*amp*(.3+.7*math.sin(math.pi*i/32))
        line(d,[(x+i*width/32,y-h),(x+i*width/32,y+h)],color,3)

def bass_inside(im,t):
    # An imaginary stage inside the tape window, where the plucked bass gets a solo.
    d=ImageDraw.Draw(im)
    text(im,"その音、",55,165,71)
    text(im,"聴こえてきた。",53,260,73)
    d.rounded_rectangle((60,472,641,920),36,fill=INK)
    d.rounded_rectangle((73,485,628,905),27,outline="#819798",width=2)
    d.rounded_rectangle((92,520,610,816),23,fill="#c7d4bd")
    for cx in (164,539):
        dot(d,cx,659,49,"#9aa99a");dot(d,cx,659,34,PAPER);dot(d,cx,659,12,INK)
        for i in range(5):
            a=t*3+i*math.tau/5
            dot(d,cx+24*math.cos(a),659+24*math.sin(a),3,INK)
    line(d,[(116,769),(580,769)],"#9aaa96",2)
    # The bass has a real bridge, four strings, an endpin and two f-holes.
    offset=5*abs(math.sin((t-1.55)*math.pi/.48))
    def pt(x,y): return (346+x,567+y-offset)
    def bez(a,b,c,e):return curve([pt(*p) for p in (a,b,c,e)],22)
    outline=[]
    parts=[((2,77),(-35,61),(-48,78),(-42,95)),
           ((-42,95),(-38,106),(-22,114),(-29,125)),
           ((-29,125),(-64,142),(-62,176),(-41,187)),
           ((-41,187),(-12,207),(31,195),(44,173)),
           ((44,173),(54,152),(38,137),(31,128)),
           ((31,128),(19,117),(28,110),(35,104)),
           ((35,104),(51,84),(30,67),(2,77))]
    for part in parts: outline.extend(bez(*part))
    d.polygon(outline,fill="#ce783a")
    line(d,outline+[outline[0]],INK,5)
    line(d,[pt(0,192),pt(-1,209)],INK,4)
    d.polygon([pt(-8,107),pt(1,-20),pt(11,-22),pt(6,111)],fill=INK)
    dot(d,*pt(8,-25),9,ORANGE);dot(d,*pt(8,-25),3,INK)
    for i in (-2,2):
        line(d,[pt(6+i,-28),pt(i,150),pt(i-3,178)],CREAM,1)
    line(d,[pt(-15,147),pt(12,148)],INK,4)
    for x in (-23,20):
        line(d,[pt(x+3,117),pt(x-2,120),pt(x+2,130),pt(x-3,133)],INK,3)
    for i in range(3):
        phase=(t/.48*.45+i/3)%1
        xx,yy=428+phase*31+i*17,639-phase*61-i*9
        dot(d,xx,yy,4,BLUE);line(d,[(xx+3,yy),(xx+3,yy-16),(xx+10,yy-13)],BLUE,2)
    text(im,"SIDE  A",109,849,25,"book",CREAM)
    wave(im,298,863,256,t,GOLD)
    caption(im,["さっきと同じ、ベースのフレーズ。"])


def frame(t):
    macro=8.1<=t<12.02
    im=Image.new("RGB",(WIDTH,HEIGHT),INK if macro else PAPER)
    d=ImageDraw.Draw(im); header(im,macro)
    if macro:
        text(im,"そこで、",58,167,66,"serif",CREAM)
        text(im,"このオレンジ。",56,263,74,"serif",GOLD)
        sc=3.64
        px,py=101,487
        a=ease(t,11.76,11.88)
        # Two visible leads keep the close-up physically connected to the previous shot.
        for end,start in [((px+39*sc,py+10*sc),(-10,636)),((px+77*sc,py+10*sc),(741,503))]:
            path=curve([start,(start[0]+(90 if start[0]<0 else -100),384),(end[0]-14,415),end])
            line(d,path,"#90b4bd",7)
        deck(im,px,py,sc,t,a)
        bx,by=px+100*sc,py+10*sc
        z=ease(t,8.48,9.22)
        if z:
            p=[(bx+3,by-11),(bx+44,by-75),(594,by-75)]
            line(d,p,GOLD,2);dot(d,bx+3,by-11,4,GOLD)
            text(im,"HOT LINE",487,by-113,23,"book",GOLD)
        if t>11.8:
            r=15+(t-11.8)*190
            d.ellipse((bx-r,by-r,bx+r,by+r),outline=GOLD,width=3)
        text(im,"音楽を聴いたまま、ひと押し。",342,1102,32,"goth",CREAM,True)
        return im

    if 15.55<=t<17.08 or 25.30<=t<26.55:
        bass_inside(im,t)
        return im
    pair(im,t,12.02<=t<15.55 or 19.8<=t<22.65)
    if t < 4.72:
        text(im,"同じ曲を、",54,166,77)
        text(im,"ふたりで。",177,276,83)
        caption(im,["一台のウォークマンに、","ヘッドホンは二つ。"])
    elif t < 8.1:
        text(im,"すぐ隣なのに。",54,160,69)
        if t<6.55:
            bubble(im,427,298,"……。",1)
            wave(im,331,661,57,t,MUTED,.40)
        else:
            bubble(im,237,301,"えっ？",-1)
        caption(im,["曲は聞こえる。","でも、今なんて言った？"])
    elif t<15.55:
        text(im,"聞こえた。",55,161,79)
        bubble(im,380,303,"ここのベース、好き。",1,"#f9d5a8")
        caption(im,["本体のマイクが拾った声が、","ふたりの耳に。"])
    elif t<23.50:
        text(im,"声の通り道。",55,154,72)
        text(im,"本体のマイク",90,302,32,"goth",MUTED)
        line(d,[(316,326),(369,326),(359,319)],ORANGE,3)
        text(im,"ヘッドホン",391,302,32,"goth",BLUE)
        caption(im,["ボタンを押すと、隣の声が","ヘッドホンから聞こえる。"])
    elif t<26.55:
        text(im,"♪",88,183,63,"serif",BLUE)
        bubble(im,280,305,"あ、ほんとだ。",-1)
        wave(im,199,220,330,t,BLUE,1.2)
        caption(im,["ふたりとも、ベースを聴いている。"])
    else:
        text(im,"初代ウォークマンの",55,172,57)
        text(im,"ホットライン。",51,264,76)
        caption(im,["音楽の途中に、ふたりの声。"],"1979年　ソニー　TPS-L2")
    return im
