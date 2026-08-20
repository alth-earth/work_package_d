"""Minimal pure-Python PNG codec used by the replay proof renderer.

Supports 8-bit truecolor (24-bit RGB) and RGBA (32-bit) non-interlaced PNGs,
including the standard scanline filters 0-4.  Keeps work_package_d free of an
image-library dependency for the offline proof image.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def write_png_rgb(path: Path, width: int, height: int, pixels: bytes) -> None:
    """Write RGB pixels (flat ``width*height*3`` bytes) as a PNG."""
    if len(pixels) != width * height * 3:
        raise ValueError("pixel buffer size does not match width*height")

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(
            ">I", zlib.crc32(body) & 0xFFFFFFFF
        )

    rowbytes = width * 3
    raw = b"".join(
        b"\x00"
        + pixels[rowbytes * row : rowbytes * row + rowbytes]
        for row in range(height)
    )
    with path.open("wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(
            chunk(
                b"IHDR",
                struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0),
            )
        )
        handle.write(chunk(b"IDAT", zlib.compress(raw, level=6)))
        handle.write(chunk(b"IEND", b""))


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png_rgb(path: Path) -> tuple[int, int, bytes]:
    """Read a PNG and return ``(width, height, flat RGB bytes)``."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG file")
    position = 8
    width = 0
    height = 0
    bit_depth = 0
    color_type = 0
    interlace = 0
    idat: list[bytes] = []
    while position + 8 <= len(data):
        (length,) = struct.unpack(">I", data[position : position + 4])
        tag = data[position + 4 : position + 8]
        chunk = data[position + 8 : position + 8 + length]
        position += 12 + length
        if tag == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
        elif tag == b"IDAT":
            idat.append(chunk)
        elif tag == b"IEND":
            break
    if not width or not height:
        raise ValueError("missing IHDR")
    if bit_depth != 8 or color_type not in (2, 6) or interlace != 0:
        raise ValueError(
            "only 8-bit truecolor/RGBA non-interlaced PNG supported: "
            f"depth={bit_depth} color_type={color_type} interlace={interlace}"
        )
    channels = 4 if color_type == 6 else 3
    raw = zlib.decompress(b"".join(idat))
    stride = width * channels
    expected = (stride + 1) * height
    if len(raw) != expected:
        raise ValueError("invalid PNG scanline data")
    decoded = bytearray(width * height * channels)
    previous = bytearray(stride)
    for row in range(height):
        filter_type = raw[row * (stride + 1)]
        line = raw[row * (stride + 1) + 1 : (row + 1) * (stride + 1)]
        offset = row * stride
        for index in range(stride):
            left = decoded[offset + index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            value = line[index]
            if filter_type == 1:
                value = (value + left) & 0xFF
            elif filter_type == 2:
                value = (value + up) & 0xFF
            elif filter_type == 3:
                value = (value + ((left + up) >> 1)) & 0xFF
            elif filter_type == 4:
                value = (value + _paeth(left, up, upper_left)) & 0xFF
            elif filter_type != 0:
                raise ValueError(f"unsupported PNG filter {filter_type}")
            decoded[offset + index] = value
        previous = bytes(decoded[offset : offset + stride])
    if channels == 4:
        rgb = bytearray(width * height * 3)
        for index in range(width * height):
            source = index * 4
            target = index * 3
            rgb[target : target + 3] = decoded[source : source + 3]
        return width, height, bytes(rgb)
    return width, height, bytes(decoded)
