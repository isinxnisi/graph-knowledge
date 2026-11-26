"""Examine the retained sequence using the same drawing, captions and sound as the edition."""
import hashlib
from pathlib import Path
import tempfile

from PIL import Image, ImageDraw

from authored_media import FPS, _encode, _write_soundtrack, prepare_scene
from writer_feedback import request_digest


def edit_proof(records, scenes, index, beat, previous=None):
    shot = scenes[index]
    key_times = beat["sampleAt"] if beat["sceneId"] == shot["id"] else []
    times = sorted({0, .25, .5, .75, 1, *key_times})
    rows = []
    if index:
        rows.append(("Leading cut", scenes[index - 1], (.75, 1)))
    if previous is not None:
        rows.append(("Before", previous, times))
    rows.append(("Current", shot, times))
    if index + 1 < len(scenes):
        rows.append(("Following cut", scenes[index + 1], (0, .25)))
    # Wrap wide strips to keep individual frames legible at model viewing resolution.
    width, height, columns = 352, 198, 4
    nrows = sum((len(at) + columns - 1) // columns for _, _, at in rows)
    sheet = Image.new("RGB", (width * columns, (height + 22) * nrows), "white")
    draw = ImageDraw.Draw(sheet)
    top = 0
    for title, scene, positions in rows:
        paint = prepare_scene(scene, "ja")
        for i, at in enumerate(positions):
            x = (i % columns) * width
            if i and i % columns == 0:
                top += height + 22
            draw.text((x + 6, top + 3), f"{title}   {scene['id']}   {at:.0%}", fill="black")
            sheet.paste(paint(at).resize((width, height), Image.Resampling.LANCZOS), (x, top + 22))
        top += height + 22
    digest = hashlib.sha256(sheet.tobytes()).hexdigest()
    path = records / ("edit-proof-" + digest + ".jpg")
    if not path.exists():
        pending = path.with_suffix(".writing")
        sheet.save(pending, format="JPEG", quality=92)
        pending.replace(path)
    return path


def render_excerpt(folder, plan, index):
    scenes = plan["scenes"]
    if type(index) is not int or not 0 <= index < len(scenes):
        raise ValueError("試写する場面を選んでください。")
    out = folder / "cut-previews"
    out.mkdir(parents=True, exist_ok=True)
    # Earlier sounds can carry across a cut. Keep the real clock through the
    # following shot, including its measured speech and deterministic foley.
    prefix = {**plan, "scenes": scenes[:index + 2]}
    key = request_digest(["cut-preview-v1", "ja", index, prefix["titles"], prefix["scenes"]])
    clip = out / (key + ".mp4")
    if not clip.is_file():
        with tempfile.TemporaryDirectory(prefix=".excerpt-", dir=out) as directory:
            work = Path(directory)
            voice, cuts = _write_soundtrack(prefix, "ja", work, lambda _: None)
            cut = cuts[index]
            start = cut["start"] - (min(FPS, cuts[index - 1]["frames"]) if index else 0)
            end = cut["start"] + cut["frames"] + (min(FPS, cuts[index + 1]["frames"]) if index + 1 < len(cuts) else 0)
            _encode(work, prefix, "ja", voice, cuts, lambda _: None, frame_range=(start, end))
            (work / "video.mp4").replace(clip)
    return clip
