"""Empacota o PNG em .ico multi-tamanho (PNG-in-ICO, Windows Vista+)."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _parse_png(data: bytes) -> tuple[int, int, bytes]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("não é PNG")
    width = height = color_type = None
    raw = bytearray()
    off = 8
    while off + 8 <= len(data):
        length = struct.unpack(">I", data[off : off + 4])[0]
        kind = data[off + 4 : off + 8]
        chunk = data[off + 8 : off + 8 + length]
        off += 12 + length
        if kind == b"IHDR":
            width, height, bit, color, *_ = struct.unpack(">IIBBBBB", chunk)
            if bit != 8 or color not in {2, 6}:
                raise ValueError("PNG precisa ser RGB ou RGBA 8-bit")
            color_type = color
        elif kind == b"IDAT":
            raw.extend(chunk)
        elif kind == b"IEND":
            break
    if width is None or height is None or color_type is None:
        raise ValueError("IHDR ausente")
    pixels = zlib.decompress(bytes(raw))
    bpp = 4 if color_type == 6 else 3
    stride = width * bpp
    rows: list[bytearray] = []
    i = 0
    for _ in range(height):
        filter_type = pixels[i]
        i += 1
        row = bytearray(pixels[i : i + stride])
        i += stride
        prev = rows[-1] if rows else bytearray(stride)
        if filter_type == 1:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + left) & 255
        elif filter_type == 2:
            for x in range(stride):
                row[x] = (row[x] + prev[x]) & 255
        elif filter_type == 3:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + ((left + prev[x]) // 2)) & 255
        elif filter_type == 4:
            for x in range(stride):
                left = row[x - bpp] if x >= bpp else 0
                up = prev[x]
                ul = prev[x - bpp] if x >= bpp else 0
                row[x] = (row[x] + _paeth(left, up, ul)) & 255
        elif filter_type != 0:
            raise ValueError(f"filtro PNG {filter_type} não suportado")
        rows.append(row)
    if color_type == 6:
        rgba = b"".join(rows)
    else:
        expanded = bytearray()
        for row in rows:
            for x in range(0, len(row), 3):
                expanded.extend(row[x : x + 3])
                expanded.append(255)
        rgba = bytes(expanded)
    return width, height, rgba


def _nearest(rgba: bytes, src: int, dst: int) -> bytes:
    out = bytearray(dst * dst * 4)
    for y in range(dst):
        sy = min(src - 1, (y * src) // dst)
        for x in range(dst):
            sx = min(src - 1, (x * src) // dst)
            si = (sy * src + sx) * 4
            di = (y * dst + x) * 4
            out[di : di + 4] = rgba[si : si + 4]
    return bytes(out)


def _png(rgba: bytes, size: int) -> bytes:
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)

    def chunk(kind: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def write_ico(png_path: Path, ico_path: Path) -> None:
    width, height, rgba = _parse_png(png_path.read_bytes())
    if width != height:
        raise ValueError("ícone precisa ser quadrado")
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [_png(_nearest(rgba, width, size), size) for size in sizes]
    count = len(images)
    offset = 6 + 16 * count
    out = bytearray(struct.pack("<HHH", 0, 1, count))
    blobs = bytearray()
    for size, data in zip(sizes, images, strict=True):
        dim = 0 if size >= 256 else size
        out.extend(struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset))
        blobs.extend(data)
        offset += len(data)
    ico_path.write_bytes(bytes(out) + bytes(blobs))


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    write_ico(root / "icon.png", root / "icon.ico")
    print(f"wrote {root / 'icon.ico'}")
