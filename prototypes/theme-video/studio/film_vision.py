"""Attach the actual rendered artwork to the existing isolated editorial call."""
from pathlib import Path

from editor import _call_writer


def style_reference():
    return Path(__file__).parent / "assets" / "channel-reference.jpg"


def view_cut(request, image_path):
    return _call_writer(request, image_path=image_path)
