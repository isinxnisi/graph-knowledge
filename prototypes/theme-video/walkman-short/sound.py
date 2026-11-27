"""Compose the original two-bar groove, dialogues and mechanical Foley."""
import io
import sys
from pathlib import Path
import wave

import numpy as np
import requests
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from channel_sound import opening_notes

RATE = 48000
LENGTH = 31.5
BEAT = .48
# Time is measured from the first visible frame.
LINES = [
    (1.05, 13, 1.04, "一台のウォークマンで、同じ曲を聴く、ふたり。"),
    (6.60, 11, 1.00, "えっ？"),
    (8.45, 13, 1.02, "そこで、このオレンジ色のボタン。"),
    (12.20, 8, .96, "ねえ。ここのベース、好き。"),
    (17.35, 13, 1.06, "ボタンを押すと、本体のマイクが、となりの声を、ヘッドホンに届けます。"),
    (23.95, 11, .98, "あ、ほんとだ。"),
    (27.10, 13, 1.01, "初代ウォークマンの、ホットライン。"),
]


def voice(cache, speaker, speed, reading):
    import hashlib
    filename = cache / (hashlib.sha256(str((speaker, speed, reading)).encode()).hexdigest() + ".wav")
    if not filename.exists():
        endpoint = "http://127.0.0.1:13769"
        params = {"speaker": speaker}
        query = requests.post(endpoint + "/audio_query", params={**params, "text": reading}, timeout=45)
        query.raise_for_status()
        data = query.json()
        data.update(speedScale=speed, outputSamplingRate=RATE, prePhonemeLength=.035, postPhonemeLength=.065)
        response = requests.post(endpoint + "/synthesis", params=params, json=data, timeout=120)
        response.raise_for_status()
        filename.write_bytes(response.content)
    with wave.open(io.BytesIO(filename.read_bytes())) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float) / 32768
    return x * min(.72 / np.abs(x).max(), .15 / max(.01, np.sqrt(np.mean(x*x))))


def make(cache):
    cache.mkdir(parents=True, exist_ok=True)
    samples = round(RATE * LENGTH)
    time = np.arange(samples) / RATE
    music = np.zeros((samples, 2))
    bass = np.zeros_like(music)
    mix = np.zeros_like(music)
    rng = np.random.default_rng(1979)

    def put(track, when, signal, pan=0):
        start = round(when * RATE)
        n = min(len(signal), samples - start)
        track[start:start+n] += signal[:n, None] * np.sqrt([1-pan, 1+pan])

    def ring(midi, duration, kind):
        t = np.arange(round(duration*RATE)) / RATE
        phase = 2*np.pi * 440*2**((midi-69)/12)*t
        if kind == "bass":
            tone = np.sin(phase) + .57*np.sin(phase*2) + .25*np.sin(phase*3) + .1*np.sin(phase*4)
            decay = 3.1
        else:
            tone = np.sin(phase + .95*np.exp(-7*t)*np.sin(phase*2)) + .15*np.sin(phase*3)
            decay = 3.8
        return tone * np.exp(-decay*t) * np.minimum(t/.012, 1) * np.clip((duration-t)/.07, 0, 1)

    for offset, note in opening_notes(RATE):
        put(mix, offset/RATE, note*1.4)
    # A syncopated descending answer, identical before and after the conversation.
    for bar in range(16):
        begin = 1.55 + bar*4*BEAT
        if begin >= 30: break
        root, keys = [(41,[57,60,64,67]),(38,[53,57,60,64]),(43,[53,59,62,67]),(36,[52,55,59,62])][bar%4]
        for count, interval, dur in [(0,0,.63),(1.55,12,.27),(2.15,7,.35),(3.05,5,.28),(3.58,4,.18)]:
            put(bass,begin+count*BEAT,.11*ring(root+interval,dur,"bass"),-.04)
        for count, gain in [(.65,.042),(2.68,.034)]:
            for j, key in enumerate(keys):
                put(music,begin+count*BEAT+j*.009,gain*ring(key,.74,"keys"),.10*(j-1))
        for count in range(8):
            t = np.arange(round(.075*RATE))/RATE
            hiss = sosfilt(butter(2,5200,fs=RATE,btype="highpass",output="sos"),rng.normal(size=len(t)))
            put(music,begin+count*.5*BEAT,.016*hiss*np.exp(-t*49),.24)
        for count in (1,3):
            t=np.arange(round(.095*RATE))/RATE
            put(music,begin+count*BEAT,.045*np.exp(-t*46)*(np.sin(1430*t)+.23*rng.normal(size=len(t))),-.18)

    def smooth(a,b):
        f=np.clip((time-a)/(b-a),0,1)
        return f*f*(3-2*f)
    button = smooth(11.80,11.95) - smooth(15.50,15.95)
    bed = (1-.82*button) * (1-smooth(29.8,LENGTH))
    for when,speaker,speed,reading in LINES:
        spoken=voice(cache,speaker,speed,reading)
        end=when+len(spoken)/RATE
        print(f"{when:.2f} - {end:.2f}",flush=True)
        put(mix,when,spoken, .12 if speaker==8 else -.10 if speaker==11 else 0)
        bed *= 1-.45*(smooth(when-.15,when+.02)-smooth(end,end+.25))
        if speaker==8:
            # The same utterance, heard from outside the headphones in the first pass.
            muffle=sosfilt(butter(4,380,fs=RATE,output="sos"),spoken)
            put(mix,4.85,.20*muffle,.15)
    mix += bed[:,None] * (music + bass * (1+.55*(smooth(15.5,15.95)-smooth(27,28)))[:,None])
    for when,scale in [(11.80,1),(15.55,.58)]:
        t=np.arange(round(.09*RATE))/RATE
        put(mix,when,scale*(.12*rng.normal(size=len(t))*np.exp(-105*t)+.18*np.sin(2*np.pi*630*t)*np.exp(-83*t)))
    mix=np.tanh(mix * 1.28)
    with wave.open(str(cache/"mix.wav"),"wb") as f:
        f.setparams((2,2,RATE,0,"NONE",""))
        f.writeframes((np.clip(mix,-.97,.97)*32767).astype("<i2").tobytes())
