"""Unit tests for the pure-Python PNG codec in ``viewer/pngcodec.py``."""

import struct
import zlib
from pathlib import Path

import pytest

from viewer.pngcodec import read_png_rgb, write_png_rgb


def _make_pixels(width: int, height: int) -> bytes:
    """Deterministic RGB pattern covering all byte values modulo 256."""
    return bytes(
        (r * 7 + c * 13 + ch * 5) & 0xFF
        for r in range(height)
        for c in range(width)
        for ch in range(3)
    )


def test_roundtrip_filter_none(tmp_path: Path) -> None:
    """write_png_rgb uses filter 0 (None); round-trip must be identical."""
    width, height = 8, 6
    pixels = _make_pixels(width, height)
    path = tmp_path / "test_none.png"
    write_png_rgb(path, width, height, pixels)
    w, h, decoded = read_png_rgb(path)
    assert (w, h) == (width, height)
    assert decoded == pixels


def test_roundtrip_rgba_input(tmp_path: Path) -> None:
    """Hand-build a simple RGBA PNG (filter 0) and verify RGB extraction."""
    width, height = 3, 2
    rgba = bytes(range(width * height * 4))  # 0..23
    stride = width * 4
    raw = b"".join(
        b"\x00" + rgba[row * stride : (row + 1) * stride]
        for row in range(height)
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(
            ">I", zlib.crc32(body) & 0xFFFFFFFF
        )

    path = tmp_path / "test_rgba.png"
    with path.open("wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, level=6)))
        f.write(chunk(b"IEND", b""))
    w, h, rgb = read_png_rgb(path)
    assert (w, h) == (width, height)
    assert rgb[:3] == bytes([0, 1, 2])
    assert rgb[3:6] == bytes([4, 5, 6])


def test_roundtrip_filter_sub(tmp_path: Path) -> None:
    """Filter 1 (Sub): decoded output must equal original."""
    width, height = 4, 3
    pixels = _make_pixels(width, height)
    stride = width * 3
    filtered = bytearray()
    for row in range(height):
        filtered.append(1)
        row_pixels = pixels[row * stride : (row + 1) * stride]
        for i in range(stride):
            left = row_pixels[i - 3] if i >= 3 else 0
            filtered.append((row_pixels[i] - left) & 0xFF)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(
            ">I", zlib.crc32(body) & 0xFFFFFFFF
        )

    path = tmp_path / "test_filter1.png"
    with path.open("wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(filtered), level=6)))
        f.write(chunk(b"IEND", b""))
    w, h, decoded = read_png_rgb(path)
    assert (w, h) == (width, height)
    assert decoded == pixels


def test_roundtrip_filter_paeth(tmp_path: Path) -> None:
    """Filter 4 (Paeth): decoded output must equal original."""
    width, height = 4, 3
    pixels = _make_pixels(width, height)
    stride = width * 3
    filtered = bytearray()
    prev_row = bytearray(stride)
    for row in range(height):
        filtered.append(4)
        row_pixels = pixels[row * stride : (row + 1) * stride]
        for i in range(stride):
            left = row_pixels[i - 3] if i >= 3 else 0
            up = prev_row[i]
            ul = prev_row[i - 3] if i >= 3 else 0
            p = left + up - ul
            pa, pb, pc = abs(p - left), abs(p - up), abs(p - ul)
            if pa <= pb and pa <= pc:
                pred = left
            elif pb <= pc:
                pred = up
            else:
                pred = ul
            filtered.append((row_pixels[i] - pred) & 0xFF)
        prev_row = row_pixels

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(
            ">I", zlib.crc32(body) & 0xFFFFFFFF
        )

    path = tmp_path / "test_filter4.png"
    with path.open("wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(filtered), level=6)))
        f.write(chunk(b"IEND", b""))
    w, h, decoded = read_png_rgb(path)
    assert (w, h) == (width, height)
    assert decoded == pixels


def test_invalid_signature_rejected(tmp_path: Path) -> None:
    path = tmp_path / "bad.png"
    path.write_bytes(b"NOTAPNG\x00")
    with pytest.raises(ValueError, match="not a PNG"):
        read_png_rgb(path)


def test_size_mismatch_rejected(tmp_path: Path) -> None:
    width, height = 4, 4
    bad_pixels = b"\x00" * 10
    path = tmp_path / "mismatch.png"
    with pytest.raises(ValueError, match="pixel buffer size"):
        write_png_rgb(path, width, height, bad_pixels)
