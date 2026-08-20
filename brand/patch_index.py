"""Injeta título, ícone e boot da marca Muchat no index do for-web."""

from __future__ import annotations

import re
import sys
from pathlib import Path

BOOT_V = "26"
HEAD = f"""  <title>Muchat</title>
  <meta name="theme-color" content="#141210">
  <link rel="icon" href="/muchat-brand/favicon.svg">
  <link rel="stylesheet" href="/muchat-brand/boot.css?v={BOOT_V}">
  <script src="/muchat-brand/boot.js?v={BOOT_V}" defer></script>
"""


def patch(html: str) -> str:
    html = html.replace("<title>Stoat</title>", "<title>Muchat</title>")
    html = html.replace('content="#000"', 'content="#141210"')
    if "/muchat-brand/boot.js" in html:
        html = re.sub(r"boot\.css\?v=\d+", f"boot.css?v={BOOT_V}", html)
        html = re.sub(r"boot\.js\?v=\d+", f"boot.js?v={BOOT_V}", html)
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
