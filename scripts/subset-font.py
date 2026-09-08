#!/usr/bin/env python3
"""
나눔스퀘어 네오를 unicode-range 두 벌로 쪼개고 `src/app/fonts.css`를 다시 만든다 (09-08).

  common  KS X 1001 2,350자 + 라틴·기호   ~424 KB   거의 모든 화면이 이것만 받는다
  rare    나머지 한글 음절 8,822자        ~1,128 KB  드문 글자가 나올 때만

왜 이렇게 하나 — 이 폰트에는 한자가 없다. 1.46MB가 곧 한글 음절 11,172자라
「안 쓰는 블록 버리기」로는 6.5%밖에 줄지 않는다. 2,350자만 남기면 71% 줄지만
사용자가 적는 제목에 드문 글자가 섞이면 그 글자만 시스템 폰트로 튄다.
unicode-range로 가르면 커버리지를 잃지 않고 평소 받는 양만 줄어든다.

**프로젝트 의존성이 아니다.** fontTools는 이 스크립트를 돌릴 때만 있으면 된다:

    python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
    /tmp/fontenv/bin/python scripts/subset-font.py

폰트를 새 버전으로 갈았을 때만 다시 돌린다. 결과물(public/fonts/*.woff2,
src/app/fonts.css)은 커밋되어 있으므로 평소 빌드에는 필요 없다.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src/app/fonts/NanumSquareNeo-Variable.woff2")
OUT_DIR = os.path.join(ROOT, "public/fonts")
CSS = os.path.join(ROOT, "src/app/fonts.css")

# 한글 말고 늘 필요한 것들 — 라틴·문장부호·통화·화살표·호환자모·전각
COMMON_EXTRA = (
    "U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+2070-209F,U+20A0-20BF,"
    "U+2100-214F,U+2500-257F,U+25A0-25FF,U+3000-303F,U+3130-318F,U+FF00-FFEF"
)


def ks_x_1001() -> set[int]:
    """KS X 1001 완성형 한글 2,350자 — EUC-KR 2바이트 중 선두 0xB0~0xC8 영역.

    표를 따로 들고 다니지 않으려고 코덱으로 뽑는다. 파이썬의 euc_kr은 CP949까지
    인코딩하므로 선두 바이트로 KS X 1001 영역만 걸러낸다.
    """
    out = set()
    for cp in range(0xAC00, 0xD7A4):
        try:
            b = chr(cp).encode("euc-kr")
        except UnicodeEncodeError:
            continue
        if len(b) == 2 and 0xB0 <= b[0] <= 0xC8:
            out.add(cp)
    return out


def to_ranges(cps: list[int]) -> str:
    """이어지는 코드포인트를 U+AAAA-BBBB로 묶는다 — CSS가 3만 자를 넘지 않게"""
    parts, start, prev = [], cps[0], cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        parts.append((start, prev))
        start = prev = c
    parts.append((start, prev))
    return ",".join(f"U+{a:04X}" if a == b else f"U+{a:04X}-{b:04X}" for a, b in parts)


def subset(unicodes: str, out_name: str) -> int:
    out = os.path.join(OUT_DIR, out_name)
    subprocess.run(
        ["pyftsubset", SRC, f"--output-file={out}", "--flavor=woff2",
         "--layout-features=*", "--no-hinting", "--desubroutinize",
         f"--unicodes={unicodes}"],
        check=True,
    )
    return os.path.getsize(out)


def main() -> None:
    if not os.path.exists(SRC):
        sys.exit(f"원본 폰트가 없다: {SRC}")
    os.makedirs(OUT_DIR, exist_ok=True)

    ks = ks_x_1001()
    rest = sorted(set(range(0xAC00, 0xD7A4)) - ks)
    range_common = to_ranges(sorted(ks)) + "," + COMMON_EXTRA
    range_rare = to_ranges(rest)

    size_common = subset(range_common, "nanum-kr-common.woff2")
    size_rare = subset(range_rare, "nanum-kr-rare.woff2")
    base = os.path.getsize(SRC)
    print(f"원본   {base:>9,} B")
    print(f"common {size_common:>9,} B  ({len(ks)}자 + 라틴·기호)")
    print(f"rare   {size_rare:>9,} B  ({len(rest)}자)")
    print(f"→ 평소 받는 양 {base:,} B → {size_common:,} B")

    header = open(CSS, encoding="utf-8").read().split("*/", 1)[0] + "*/\n"
    face = """
@font-face {{
  font-family: "NanumSquareNeo";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/{f}") format("woff2");
  unicode-range: {r};
}}
"""
    open(CSS, "w", encoding="utf-8").write(
        header
        + face.format(f="nanum-kr-common.woff2", r=range_common)
        + face.format(f="nanum-kr-rare.woff2", r=range_rare)
    )
    print(f"→ {CSS} 갱신")


if __name__ == "__main__":
    main()
