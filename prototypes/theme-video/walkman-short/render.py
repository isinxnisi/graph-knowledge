"""Render a standalone portrait short; no production-room state is involved."""
import argparse
from pathlib import Path
import subprocess
import tempfile

from PIL import Image
from picture import FPS, HEIGHT, WIDTH, frame
from sound import HERE, LENGTH, make


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--audio-ready", action="store_true",help="Reuse the previous mix in the temp directory")
    parser.add_argument("--sheet",type=Path,help="Draw selected frames without encoding")
    args=parser.parse_args()
    cache=Path(tempfile.gettempdir())/"plunode-bass-short"
    if args.sheet:
        sheet=Image.new("RGB",(4*216,2*384))
        for i,t in enumerate([1.4,5.4,7.3,10.3,13.7,19.8,24.7,28.8]):
            sheet.paste(frame(t).resize((216,384),Image.Resampling.LANCZOS),(i%4*216,i//4*384))
        sheet.save(args.sheet)
        return
    if not args.audio_ready:
        make(cache)
    target=HERE/"hotline.ja.mp4"
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-y","-f","rawvideo","-pix_fmt","rgb24",
         "-s",f"{WIDTH}x{HEIGHT}","-r",str(FPS),"-i","-","-i",str(cache/"mix.wav"),
         "-c:v","libx264","-preset","fast","-crf","17","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k",
         "-metadata","title=ここのベース、好き。","-metadata","artist=Plunode",
         "-movflags","+faststart",str(target)]
    with subprocess.Popen(cmd,stdin=subprocess.PIPE) as encoder:
        for i in range(round(LENGTH*FPS)):
            encoder.stdin.write(frame(i/FPS).tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise SystemExit("FFmpeg failed")

if __name__=="__main__":
    main()
