#!/usr/bin/env python3
"""
마크다운 파일을 깔끔한 한국어 PDF로 변환.
- 입력: .md 파일 경로
- 출력: 같은 이름의 .pdf 파일 (같은 폴더)

흐름:
1. Markdown → HTML (markdown 라이브러리, extensions: tables, fenced_code 등)
2. HTML에 인라인 CSS 합치기 (한글 폰트, A4, 표/코드 스타일)
3. Chrome headless로 HTML → PDF

비개발자에게 줄 매뉴얼이라 레이아웃 깔끔함 최우선.
"""

import os
import sys
import re
import subprocess
import tempfile
from pathlib import Path

try:
    import markdown
except ImportError:
    print("ERROR: markdown 라이브러리가 필요합니다. `pip3 install --user markdown` 실행하세요.")
    sys.exit(1)

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page {
  size: A4;
  margin: 22mm 18mm 22mm 18mm;
}

* { box-sizing: border-box; }

html, body {
  font-family: "Apple SD Gothic Neo", "SF Pro Text", "Helvetica Neue",
               "Malgun Gothic", "Noto Sans KR", sans-serif;
  font-size: 11.5pt;
  line-height: 1.75;
  letter-spacing: 0.005em;
  color: #1a1a1a;
  margin: 0;
  padding: 0;
}

h1 {
  font-size: 24pt;
  font-weight: 700;
  margin: 0 0 24px 0;
  padding-bottom: 14px;
  border-bottom: 3px solid #d97706;
  letter-spacing: -0.01em;
  color: #0a0a0a;
}

h2 {
  font-size: 17pt;
  font-weight: 700;
  margin: 38px 0 16px 0;
  padding: 12px 16px;
  background: linear-gradient(90deg, rgba(217, 119, 6, 0.10) 0%, rgba(217, 119, 6, 0.02) 100%);
  border-left: 4px solid #d97706;
  border-radius: 6px;
  letter-spacing: -0.01em;
  color: #1a1a1a;
  page-break-after: avoid;
}

h3 {
  font-size: 13pt;
  font-weight: 700;
  margin: 26px 0 10px 0;
  color: #1a1a1a;
  page-break-after: avoid;
}

p {
  margin: 0 0 12px 0;
}

strong { font-weight: 700; color: #0a0a0a; }
em { font-style: italic; }

ul, ol {
  margin: 0 0 14px 0;
  padding-left: 22px;
}

li {
  margin: 6px 0;
}

/* 체크박스 리스트 - [ ] / - [x] */
ul li input[type="checkbox"] {
  width: 13px;
  height: 13px;
  margin-right: 6px;
  vertical-align: middle;
}

blockquote {
  margin: 14px 0;
  padding: 10px 16px;
  border-left: 3px solid #d97706;
  background: #fef3c7;
  color: #422006;
  border-radius: 0 6px 6px 0;
}

blockquote p { margin: 4px 0; }

hr {
  border: none;
  border-top: 1px solid #e5e5e5;
  margin: 26px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 10.5pt;
  page-break-inside: avoid;
}

th, td {
  border: 1px solid #e5e5e5;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f5f5f4;
  font-weight: 700;
  color: #0a0a0a;
}

tr:nth-child(even) td {
  background: #fafaf9;
}

/* 인라인 코드 */
code {
  background: #fef3c7;
  color: #92400e;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 0.9em;
  word-break: break-all;
}

/* 코드 블록 */
pre {
  background: #f5f5f4;
  padding: 14px 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 10pt;
  line-height: 1.6;
  border-left: 3px solid #d97706;
}

pre code {
  background: transparent;
  color: #1a1a1a;
  padding: 0;
  font-size: 10pt;
}

a { color: #d97706; text-decoration: none; word-break: break-all; }
a:hover { text-decoration: underline; }

/* 페이지 나눔 컨트롤 */
h1, h2, h3 { page-break-after: avoid; }
table, pre, blockquote { page-break-inside: avoid; }
"""


def md_to_html(md_text: str) -> str:
    """Markdown → HTML body."""
    extensions = [
        "extra",        # 표, fenced code, abbr 등
        "tables",
        "fenced_code",
        "sane_lists",
        "nl2br",        # 줄바꿈을 <br>로
        "md_in_html",
    ]
    html = markdown.markdown(md_text, extensions=extensions, output_format="html5")
    # 체크박스 패턴 변환: <li>[ ] xxx</li> → <li><input type="checkbox" disabled> xxx</li>
    html = re.sub(
        r"<li>\s*\[ \]\s*",
        '<li><input type="checkbox" disabled> ',
        html,
    )
    html = re.sub(
        r"<li>\s*\[x\]\s*",
        '<li><input type="checkbox" checked disabled> ',
        html,
        flags=re.IGNORECASE,
    )
    return html


def wrap_html(body: str, title: str) -> str:
    """HTML 문서로 감싸기."""
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>
"""


def html_to_pdf(html_path: str, pdf_path: str) -> None:
    """Chrome headless로 HTML → PDF."""
    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        f"file://{html_path}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print("Chrome stderr:", result.stderr)
        raise RuntimeError(f"Chrome PDF 변환 실패 (exit {result.returncode})")


def convert(md_path: Path) -> Path:
    pdf_path = md_path.with_suffix(".pdf")
    md_text = md_path.read_text(encoding="utf-8")

    body = md_to_html(md_text)
    full_html = wrap_html(body, md_path.stem)

    # 임시 HTML 파일 (Chrome이 읽을 수 있어야 함)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".html", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(full_html)
        tmp_html = tmp.name

    try:
        html_to_pdf(tmp_html, str(pdf_path))
        print(f"✓ {md_path.name} → {pdf_path.name}")
    finally:
        os.unlink(tmp_html)

    return pdf_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: md-to-pdf.py <file.md> [file2.md ...]")
        sys.exit(1)

    for arg in sys.argv[1:]:
        p = Path(arg).expanduser().resolve()
        if not p.exists():
            print(f"파일 없음: {p}")
            continue
        convert(p)
