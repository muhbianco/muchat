"""Injeta título, ícone e boot da marca Muchat no index do for-web."""

from __future__ import annotations

import sys
from pathlib import Path

HEAD = """  <title>Muchat</title>
  <meta name="theme-color" content="#141210">
  <link rel="icon" href="/muchat-brand/favicon.svg">
  <link rel="stylesheet" href="/muchat-brand/boot.css?v=23">
  <script src="/muchat-brand/boot.js?v=23" defer></script>
"""


def patch(html: str) -> str:
    html = html.replace("<title>Stoat</title>", "<title>Muchat</title>")
    html = html.replace('content="#000"', 'content="#141210"')
    if "/muchat-brand/boot.js" in html:
        html = html.replace("boot.css?v=20", "boot.css?v=23")
        html = html.replace("boot.js?v=20", "boot.js?v=23")
        html = html.replace("boot.css?v=21", "boot.css?v=23")
        html = html.replace("boot.js?v=21", "boot.js?v=23")
        html = html.replace("boot.css?v=22", "boot.css?v=23")
        html = html.replace("boot.js?v=22", "boot.js?v=23")
        return html
    needle = '<script type="module"'
    if needle in html:
        return html.replace(needle, HEAD + needle, 1)
    close = "</head>"
    if close not in html:
        raise SystemExit("index.html sem </head>")
    return html.replace(close, HEAD + close, 1)


def main() -> None:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    dst.write_text(patch(src.read_text(encoding="utf-8")), encoding="utf-8")
    print(f"patched {dst}")


if __name__ == "__main__":
    main()
