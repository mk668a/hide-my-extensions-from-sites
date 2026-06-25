#!/usr/bin/env python3
"""Generate the toolbar icons (16/48/128) with stdlib only — no Pillow.

Draws an emerald shield with a keyhole cut-out on a dark rounded-square tile,
supersampled 3x for smooth edges, and writes RGBA PNGs.
"""
import math
import os
import struct
import zlib

BG = (15, 23, 42)        # #0f172a dark navy tile
SHIELD = (52, 211, 153)  # #34d399 emerald
OUT = os.path.join(os.path.dirname(__file__), "..", "icons")


def rounded_rect(s, t, radius):
    # SDF for a unit rounded square centred at (0.5, 0.5); inside when <= 0.
    qx = abs(s - 0.5) - (0.5 - radius)
    qy = abs(t - 0.5) - (0.5 - radius)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0)
    return outside <= 0.0


def in_shield(s, t):
    top, shoulder, point, half = 0.16, 0.52, 0.88, 0.34
    if t < top or t > point:
        return False
    if t <= shoulder:
        hw = half
        if t < top + 0.12:  # round the top corners
            k = (top + 0.12 - t) / 0.12
            hw *= math.sqrt(max(0.0, 1.0 - k * k))
    else:
        hw = half * (point - t) / (point - shoulder)
    return abs(s - 0.5) <= hw


def in_keyhole(s, t):
    if (s - 0.5) ** 2 + (t - 0.43) ** 2 <= 0.072 ** 2:
        return True
    return abs(s - 0.5) <= 0.032 and 0.43 <= t <= 0.62


def sample(s, t):
    # Returns (r, g, b, a) for a point in the unit square.
    if not rounded_rect(s, t, 0.22):
        return (0, 0, 0, 0)
    if in_shield(s, t) and not in_keyhole(s, t):
        return (*SHIELD, 255)
    return (*BG, 255)


def render(size):
    ss = 3  # supersampling factor
    pixels = []
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    s = (x + (sx + 0.5) / ss) / size
                    t = (y + (sy + 0.5) / ss) / size
                    pr, pg, pb, pa = sample(s, t)
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
            n = ss * ss
            alpha = a / n
            if alpha > 0:
                pixels.append((round(r / a), round(g / a), round(b / a), round(alpha)))
            else:
                pixels.append((0, 0, 0, 0))
    return pixels


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            raw += bytes(pixels[y * size + x])

    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 48, 128):
        path = os.path.join(OUT, f"icon{size}.png")
        write_png(path, size, render(size))
        print("wrote", os.path.relpath(path))


if __name__ == "__main__":
    main()
