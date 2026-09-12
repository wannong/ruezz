#!/usr/bin/env python3
"""pdf2md-layout: born-digital PDF -> Markdown, minimal footprint.

Design in one breath
--------------------
`pymupdf4llm` (with its bundled `pymupdf-layout` model) already does the heavy
lifting on a born-digital PDF: multi-column reading order, headings, lists,
Markdown tables, and figure crops. It has exactly two gaps for scientific
papers, and this tool closes both without adding a single new dependency:

1. **Mojibake.** LaTeX math fonts often ship an incomplete `/ToUnicode` CMap,
   so Greek capitals / ℏ / operators extract as U+FFFD. We rebuild the missing
   entries from the font's own `/Encoding /Differences` glyph names and patch
   the CMap *in memory* before extraction. Every downstream consumer then sees
   correct Unicode. (See glyphmap.py.)

2. **Formulas.** The layout model localizes every equation (class ``formula``)
   but deliberately does not read its text. We crop each formula region to a
   PNG. A pluggable ``formula_backend`` may turn that crop into LaTeX; the
   default keeps it as an image reference (offline, zero-cost).

Regions are spliced back by character offset (``pos``) in descending order so
offsets stay valid. Inline math is an optional, conservative post-pass that
wraps math-font runs in ``$...$`` while preserving Unicode symbols.

Usage
-----
    python pdf2md.py paper.pdf -o out/            # writes out/paper.md + assets
    python pdf2md.py paper.pdf --no-inline-math
    python pdf2md.py paper.pdf --formula-backend glm_ocr   # if you wire one up

Requires: pymupdf4llm>=1.28 (pulls pymupdf, pymupdf-layout). No network.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import pymupdf
    import pymupdf4llm
except ImportError as exc:  # pragma: no cover
    sys.exit(f"missing dependency: {exc}. Run: pip install 'pymupdf4llm>=1.28'")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from glyphmap import build_glyph_repair  # noqa: E402


# --------------------------------------------------------------------------
# Step 1 -- in-memory ToUnicode repair
# --------------------------------------------------------------------------
def patch_tounicode(doc, repairs: dict[tuple[str, int], str]) -> int:
    """Merge recovered code->char pairs into each font's ToUnicode CMap.

    Returns the number of glyph entries patched. Operates on the open
    document in memory; the source file is never modified.
    """
    patched = 0
    for xref in range(1, doc.xref_length()):
        try:
            obj = doc.xref_object(xref)
        except Exception:
            continue
        if "/Font" not in obj:
            continue
        bf = re.search(r"/BaseFont\s*/([#\w\-+]+)", obj)
        if not bf:
            continue
        name = bf.group(1).split("+")[-1]
        adds = {c: ch for (fn, c), ch in repairs.items() if fn == name}
        if not adds:
            continue
        lines = [f"<{c:02X}> <{ord(ch):04X}>" for c, ch in sorted(adds.items())]
        block = f"{len(lines)} beginbfchar\n" + "\n".join(lines) + "\nendbfchar"
        tu = re.search(r"/ToUnicode\s+(\d+) 0 R", obj)
        if tu:
            tu_xref = int(tu.group(1))
            try:
                old = doc.xref_stream(tu_xref).decode("latin-1")
            except Exception:
                continue
            merged = re.sub(r"endcmap", block + "\nendcmap", old, count=1)
            doc.update_stream(tu_xref, merged.encode("latin-1"))
        else:
            body = (
                "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
                "/CMapType 2 def\n"
                "1 begincodespacerange <00> <ff> endcodespacerange\n"
                f"{block}\nendcmap\n"
                "CMapName currentdict /CMap defineresource pop end end"
            )
            new_xref = doc.get_new_xref()
            doc.update_object(new_xref, "<<>>")
            doc.update_stream(new_xref, body.encode("latin-1"))
            doc.xref_set_key(xref, "ToUnicode", f"{new_xref} 0 R")
        patched += len(adds)
    return patched


# --------------------------------------------------------------------------
# Step 3 -- formula backends (pluggable)
# --------------------------------------------------------------------------
def formula_as_image(png_path: str, fid: str, png_bytes: bytes) -> str:
    """Default backend: emit an image reference plus a stable id marker.

    The trailing HTML comment is invisible when rendered but lets a
    vision-capable agent (or ``apply_formulas``) locate and replace exactly
    this equation later. A text-only consumer simply sees the image.
    """
    return f"![formula]({png_path})<!--FID:{fid}-->"


def make_backend(name: str):
    """Return a callable(png_path, fid, png_bytes) -> markdown snippet.

    Backends are optional. The default ``image`` keeps equations as crops and
    is the right choice for a **text-only** caller. A **multimodal** caller
    should instead leave the default in place, then read the emitted
    ``*.formulas.json`` manifest, turn each crop into LaTeX with its own vision,
    and splice it back via ``apply_formulas`` (CLI: ``--apply-latex``). That
    keeps the "can this model see images?" decision in the agent, where it
    belongs -- this script cannot know what model is calling it.

    A named backend (e.g. ``glm_ocr``) is for a fully automated OCR/VLM API;
    wire it in ``references/formula_backends.md`` and return ``$$..$$``.
    """
    if name in ("image", "none", None):
        return formula_as_image
    raise SystemExit(
        f"formula backend {name!r} is not wired up. Edit make_backend() in "
        "pdf2md.py -- see references/formula_backends.md for GLM-OCR / MinerU "
        "/ Mistral examples. Default backend 'image' needs no setup, and the "
        "agent-driven multimodal path uses --apply-latex, not a backend."
    )


def apply_formulas(md_path, mapping: dict, *, keep_image: bool = False) -> int:
    """Splice agent-produced LaTeX into a converted Markdown file.

    `mapping` is ``{formula_id: "latex body"}`` (no ``$$`` -- we add it).
    Each ``![formula](...)<!--FID:id-->`` whose id is in the mapping becomes a
    ``$$ ... $$`` block. Ids left out of the mapping keep their image. Returns
    the number of equations filled. Deterministic and id-based, so a
    multimodal agent can fill formulas in any order or in batches.
    """
    from pathlib import Path as _P

    md_path = _P(md_path)
    text = md_path.read_text(encoding="utf-8")
    filled = 0

    def repl(m: re.Match) -> str:
        nonlocal filled
        img, fid = m.group(1), m.group(2)
        if fid not in mapping:
            return m.group(0)
        latex = mapping[fid].strip().strip("$").strip()
        filled += 1
        block = f"$$\n{latex}\n$$"
        if keep_image:
            return f"![formula]({img})\n\n{block}"
        return block

    pattern = re.compile(r"!\[formula\]\(([^)]*)\)<!--FID:([^>]+)-->")
    text = pattern.sub(repl, text)
    md_path.write_text(text, encoding="utf-8")
    return filled


# --------------------------------------------------------------------------
# Step 4 -- conservative inline-math wrapping
# --------------------------------------------------------------------------
# Characters that unambiguously signal mathematics.
_MATH_CHARS = (
    "\u0370-\u03ff"   # Greek
    "\u2190-\u21ff"   # arrows
    "\u2200-\u22ff"   # mathematical operators
    "\u2080-\u209f"   # sub/superscripts
    "\u210f"          # ℏ
    "\u00d7\u00f7\u00b1"  # × ÷ ±
)
_HAS_MATH = re.compile(f"[{_MATH_CHARS}]")


def _sup_sub(fragment: str) -> str:
    """Convert HTML sup/sub tags to LaTeX inside a math context."""
    fragment = re.sub(r"<sup>(.*?)</sup>", lambda m: f"^{{{m.group(1)}}}", fragment)
    fragment = re.sub(r"<sub>(.*?)</sub>", lambda m: f"_{{{m.group(1)}}}", fragment)
    return fragment


def wrap_inline_math(md: str) -> str:
    """Wrap runs of math-font italics in ``$...$``, preserving Unicode.

    Correctness-first and deliberately narrow. A candidate italic run
    (pymupdf4llm emits these as ``_x_``) is converted only when it *contains*
    a math symbol (Greek letter, operator, ℏ, arrow, sub/superscript digit).
    Adjacent ``<sup>``/``<sub>`` tags -- which the extractor has already
    identified unambiguously -- are folded in as LaTeX scripts.

    What it does NOT do: grab a following whitespace-separated token as a
    subscript. pymupdf4llm renders true subscripts (e.g. n_a) as a separate
    ``na`` run with no markup, which is indistinguishable from the next
    English word (``at``, ``is``). Guessing there corrupts prose, so we never
    do it. Result: ``$Ω$ s`` rather than a risky ``$Ω_{s}$``. For faithful
    subscript reattachment, use the geometric pass documented in
    references/inline_math.md.
    """
    lines = md.splitlines()
    out = []
    in_fence = False
    for line in lines:
        if line.startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence or line.startswith("|") or line.lstrip().startswith("!["):
            out.append(line)
            continue
        out.append(_wrap_line(line))
    return "\n".join(out)


# _x_ possibly trailed only by explicit <sup>/<sub> tags (never a bare word).
_ITALIC = re.compile(
    r"_([^_\n]{1,60}?)_"
    r"((?:<sup>.*?</sup>|<sub>.*?</sub>)*)"
)


def _wrap_line(line: str) -> str:
    def repl(m: re.Match) -> str:
        body, scripts = m.group(1), m.group(2)
        if not _HAS_MATH.search(body):
            return m.group(0)  # ordinary italic prose -- leave untouched
        expr = body.strip()
        if scripts:
            expr += _sup_sub(scripts)
        return f"${expr}$"

    return _ITALIC.sub(repl, line)


# --------------------------------------------------------------------------
# Step 2 + assembly -- layout-driven region splice
# --------------------------------------------------------------------------
def convert(
    pdf_path: str,
    out_dir: str,
    *,
    inline_math: bool = True,
    formula_backend: str = "image",
    dpi: int = 260,
    table_image: bool = False,
    verbose: bool = True,
) -> Path:
    pdf_path = Path(pdf_path)
    out_dir = Path(out_dir)
    assets = out_dir / (pdf_path.stem + "_assets")
    assets.mkdir(parents=True, exist_ok=True)
    backend = make_backend(formula_backend)

    doc = pymupdf.open(pdf_path)

    # Step 1: repair mojibake before any text extraction.
    repairs = build_glyph_repair(doc)
    n_fixed = patch_tounicode(doc, repairs)
    if verbose:
        print(f"[glyph] patched {n_fixed} unmapped glyph(s) across fonts")

    # A pristine copy for cropping figures/formulas. `to_markdown` runs the
    # layout OCR pass, which writes a recognized-text layer back onto the pages;
    # cropping from that mutated document double-exposes figures ("ghosting").
    # We therefore render every crop from `crop_doc`, which OCR never touches.
    crop_doc = pymupdf.open(pdf_path)

    # Layout-aware extraction with per-region metadata (may run OCR on `doc`).
    chunks = pymupdf4llm.to_markdown(
        doc, page_chunks=True, write_images=False, show_progress=False
    )

    n_formula = n_picture = n_table = 0
    pages_md = []
    manifest = []  # one entry per formula, for an agent to fill with LaTeX
    for pi, ch in enumerate(chunks):
        text = ch["text"]
        page = crop_doc[pi]  # crop from the OCR-free copy, not the mutated doc
        wanted = {"formula", "picture"}
        if table_image:
            wanted.add("table")
        regions = [b for b in ch.get("page_boxes", []) if b["class"] in wanted]
        n_table += sum(1 for b in ch.get("page_boxes", []) if b["class"] == "table")
        # Splice descending so earlier offsets remain valid.
        for b in sorted(regions, key=lambda b: b["pos"][0], reverse=True):
            start, stop = b["pos"]
            rect = pymupdf.Rect(b["bbox"]) + (-4, -4, 4, 4)
            pix = page.get_pixmap(clip=rect, dpi=dpi)
            png_bytes = pix.tobytes("png")
            fname = f"p{pi + 1:02d}_{b['class'][:3]}{b['index']:02d}.png"
            (assets / fname).write_bytes(png_bytes)
            rel = f"{assets.name}/{fname}"
            if b["class"] == "formula":
                fid = f"p{pi + 1:02d}f{b['index']:02d}"
                snippet = backend(rel, fid, png_bytes)
                token = f"\n\n{snippet}\n\n"
                manifest.append({
                    "id": fid,
                    "image": rel,
                    "page": pi + 1,
                    "bbox": [round(x, 1) for x in b["bbox"]],
                    "latex": None,
                })
                n_formula += 1
            elif b["class"] == "table":
                # Keep the layout model's Markdown table AND a faithful crop,
                # so complex/merged tables survive even if the pipe table is lossy.
                original = text[start:stop]
                token = f"\n\n![table]({rel})\n\n{original}\n\n"
                n_picture += 0
            else:
                token = f"\n\n![figure]({rel})\n\n"
                n_picture += 1
            text = text[:start] + token + text[stop:]
        pages_md.append(text)

    md = "\n\n".join(pages_md)
    if inline_math:
        md = wrap_inline_math(md)
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"

    out_file = out_dir / (pdf_path.stem + ".md")
    out_file.write_text(md, encoding="utf-8")

    # Emit the formula manifest so a multimodal agent can fill LaTeX later.
    manifest_file = None
    if manifest:
        manifest_file = out_dir / (pdf_path.stem + ".formulas.json")
        manifest_file.write_text(
            json.dumps(
                {"markdown": out_file.name, "formulas": manifest},
                ensure_ascii=False,
                indent=1,
            ),
            encoding="utf-8",
        )

    if verbose:
        print(
            f"[done] {out_file}\n"
            f"       formulas={n_formula} figures={n_picture} tables~={n_table} "
            f"assets={assets}"
        )
        if manifest_file:
            print(
                f"[formulas] manifest -> {manifest_file}\n"
                "       If you (the calling model) can read images: read each crop,\n"
                "       write its LaTeX into the manifest, then run\n"
                f"         python pdf2md.py --apply-latex \"{manifest_file}\"\n"
                "       Text-only callers can ignore this; equations stay as images."
            )
    return out_file


def _run_apply_latex(manifest_path: str, keep_image: bool, quiet: bool):
    """CLI helper: read a manifest whose entries now carry LaTeX and splice it.

    The multimodal agent fills each formula's ``latex`` field in the manifest
    JSON (by reading the crop image), then runs this. Only non-null latex
    fields are applied; the rest keep their image.
    """
    mp = Path(manifest_path)
    data = json.loads(mp.read_text(encoding="utf-8"))
    md_file = mp.parent / data["markdown"]
    mapping = {
        f["id"]: f["latex"]
        for f in data.get("formulas", [])
        if f.get("latex")
    }
    if not mapping:
        raise SystemExit(
            "no formula in the manifest has a 'latex' value yet. Read each "
            "crop image, write its LaTeX into the manifest's 'latex' fields, "
            "then rerun --apply-latex."
        )
    n = apply_formulas(md_file, mapping, keep_image=keep_image)
    if not quiet:
        print(f"[apply-latex] filled {n}/{len(data.get('formulas', []))} "
              f"formula(s) into {md_file}")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Born-digital PDF -> Markdown (layout-aware, minimal footprint).")
    ap.add_argument("pdf", nargs="?", help="input PDF path (omit when using --apply-latex)")
    ap.add_argument("-o", "--out", default=".", help="output directory (default: cwd)")
    ap.add_argument("--no-inline-math", action="store_true", help="do not wrap inline math in $...$")
    ap.add_argument("--formula-backend", default="image", help="formula handler: image (default) or a wired backend name")
    ap.add_argument("--dpi", type=int, default=260, help="crop resolution for figures/formulas")
    ap.add_argument("--table-image", action="store_true", help="also save a crop of each detected table alongside its Markdown")
    ap.add_argument("--apply-latex", metavar="MANIFEST.json", help="splice agent-filled LaTeX from a *.formulas.json manifest into its Markdown")
    ap.add_argument("--keep-image", action="store_true", help="with --apply-latex, keep the crop above each filled equation")
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args(argv)

    if args.apply_latex:
        _run_apply_latex(args.apply_latex, args.keep_image, args.quiet)
        return
    if not args.pdf:
        ap.error("pdf path is required unless --apply-latex is given")
    convert(
        args.pdf,
        args.out,
        inline_math=not args.no_inline_math,
        formula_backend=args.formula_backend,
        dpi=args.dpi,
        table_image=args.table_image,
        verbose=not args.quiet,
    )


if __name__ == "__main__":
    main()
