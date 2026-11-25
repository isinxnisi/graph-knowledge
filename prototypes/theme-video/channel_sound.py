"""Four synthesized notes for the opening of a Plunode episode."""
import numpy as np


def opening_notes(sample_rate):
    """Yield each note's sample offset and mono signal in the original mix."""
    t = np.arange(round(.49 * sample_rate)) / sample_rate
    envelope = np.minimum(t / .018, 1) * np.exp(-t * 8) * np.minimum((.49 - t) / .04, 1)
    for start, hz in ((.08, 349.23), (.34, 440), (.64, 392), (1.03, 523.25)):
        tone = .12 * envelope * (np.sin(2 * np.pi * hz * t) + .22 * np.sin(4 * np.pi * hz * t))
        yield round(start * sample_rate), tone
