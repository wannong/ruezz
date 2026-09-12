"""Recover Unicode for PDF glyphs whose ToUnicode CMap is incomplete.

Why this exists
---------------
LaTeX-produced PDFs routinely embed math fonts (MathTime `MTMI`/`MTSYN`/`MTEX`,
Computer Modern `CMMI`/`CMSY`, AMS `MSBM10`) whose `/Encoding /Differences`
array names every glyph correctly, while the `/ToUnicode` CMap omits a handful
of them. Text extractors then emit U+FFFD for those codes.

The fix is deterministic rather than heuristic: read the glyph *name* from
`/Differences` and translate the name to Unicode. A name like `Omega1` is
unambiguous -- it is the Adobe Glyph List convention for a variant of Omega.

Public API
----------
    build_glyph_repair(doc) -> {(fontname, code): "char"}
    repair_span(text, fontname, table) -> text

Everything is derived from the document itself; no network, no model.
"""

from __future__ import annotations

import re
import unicodedata

# --- Glyph names that appear in TeX math fonts and are not plain AGL names.
# The trailing "1" in MathTime names marks an upright/variant form.
_MATH_NAMES: dict[str, str] = {
    # Greek capitals (MathTime variant forms)
    "Gamma1": "\u0393", "Delta1": "\u0394", "Theta1": "\u0398",
    "Lambda1": "\u039b", "Xi1": "\u039e", "Pi1": "\u03a0",
    "Sigma1": "\u03a3", "Upsilon1": "\u03a5", "Phi1": "\u03a6",
    "Psi1": "\u03a8", "Omega1": "\u03a9",
    # Greek lowercase variants
    "epsilon1": "\u03f5", "theta1": "\u03d1", "phi1": "\u03d5",
    "pi1": "\u03d6", "rho1": "\u03f1", "sigma1": "\u03c2",
    "kappa1": "\u03f0", "beta1": "\u03d0", "gamma1": "\u03b3",
    # Planck constant, the classic AMS/MathTime offender
    "planckover2pi": "\u210f", "planckover2pi1": "\u210f",
    "hbar": "\u210f", "hslash": "\u210f",
    # Operators and relations
    "minus": "\u2212", "plusminus": "\u00b1", "minusplus": "\u2213",
    "multiply": "\u00d7", "divide": "\u00f7", "asteriskmath": "\u2217",
    "periodcentered": "\u00b7", "bullet": "\u2219",
    "lessequal": "\u2264", "greaterequal": "\u2265", "notequal": "\u2260",
    "approxequal": "\u2248", "equivalence": "\u2261", "similar": "\u223c",
    "congruent": "\u2245", "proportional": "\u221d",
    "propersubset": "\u2282", "propersuperset": "\u2283",
    "reflexsubset": "\u2286", "reflexsuperset": "\u2287",
    "element": "\u2208", "notelement": "\u2209",
    "infinity": "\u221e", "partialdiff": "\u2202", "gradient": "\u2207",
    "summation": "\u2211", "product": "\u220f", "integral": "\u222b",
    "integraldisplay": "\u222b", "integraltext": "\u222b",
    "summationdisplay": "\u2211", "productdisplay": "\u220f",
    "radical": "\u221a", "radicalbig": "\u221a", "radicalbigg": "\u221a",
    "radicalBig": "\u221a", "radicalBigg": "\u221a",
    "angle": "\u2220", "perpendicular": "\u22a5", "emptyset": "\u2205",
    "logicaland": "\u2227", "logicalor": "\u2228", "logicalnot": "\u00ac",
    "union": "\u222a", "intersection": "\u2229",
    "dagger": "\u2020", "daggerdbl": "\u2021", "prime": "\u2032",
    "ellipsis": "\u2026", "ldots": "\u2026", "cdots": "\u22ef",
    # Arrows
    "arrowright": "\u2192", "arrowleft": "\u2190", "arrowup": "\u2191",
    "arrowdown": "\u2193", "arrowboth": "\u2194",
    "arrowdblright": "\u21d2", "arrowdblleft": "\u21d0",
    "arrowdblboth": "\u21d4",
    # Delimiters, incl. the "big" family MTEX uses for display math
    "braceleftbig": "{", "bracerightbig": "}",
    "braceleftBig": "{", "bracerightBig": "}",
    "braceleftbigg": "{", "bracerightbigg": "}",
    "bracketleftbig": "[", "bracketrightbig": "]",
    "bracketleftBig": "[", "bracketrightBig": "]",
    "bracketleftbigg": "[", "bracketrightbigg": "]",
    "parenleftbig": "(", "parenrightbig": ")",
    "parenleftBig": "(", "parenrightBig": ")",
    "parenleftbigg": "(", "parenrightbigg": ")",
    "angbracketleft": "\u27e8", "angbracketright": "\u27e9",
    "bar": "|", "bardbl": "\u2016", "vextendsingle": "|",
}

# Greek letter names -> Unicode, generated rather than hand-listed.
_GREEK = [
    ("Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
     "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho",
     None, "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega"),
    ("alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
     "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho",
     "sigma1", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"),
]
for _base, _row in ((0x0391, _GREEK[0]), (0x03B1, _GREEK[1])):
    for _i, _nm in enumerate(_row):
        if _nm:
            _MATH_NAMES.setdefault(_nm, chr(_base + _i))

_UNI_NAME = re.compile(r"^uni([0-9A-Fa-f]{4,6})$")
_UXXXX = re.compile(r"^u([0-9A-Fa-f]{4,6})$")
_GXX = re.compile(r"^(?:g|cid|glyph|index)(\d+)$", re.I)


def glyph_name_to_char(name: str) -> str | None:
    """Translate one PostScript/AGL glyph name to a character, or None."""
    if not name or name == ".notdef":
        return None
    # Drop AGL suffixes such as "a.sc" or "one.taboldstyle".
    base = name.split(".")[0]
    if not base:
        return None
    if base in _MATH_NAMES:
        return _MATH_NAMES[base]
    m = _UNI_NAME.match(base) or _UXXXX.match(base)
    if m:
        try:
            return chr(int(m.group(1), 16))
        except ValueError:
            return None
    if len(base) == 1:
        return base
    # Fall back to the Unicode character database ("summation" etc.).
    try:
        return unicodedata.lookup(base.upper())
    except KeyError:
        pass
    if _GXX.match(base):
        return None  # subset index, carries no semantic information
    return None


def _parse_differences(encoding_src: str) -> dict[int, str]:
    """Parse a PDF `/Differences [ 2 /pi /omega 181 /mu ]` array."""
    m = re.search(r"/Differences\s*\[(.*?)\]", encoding_src, re.S)
    if not m:
        return {}
    out: dict[int, str] = {}
    code = 0
    for tok in m.group(1).split():
        if tok.startswith("/"):
            out[code] = tok[1:]
            code += 1
        else:
            try:
                code = int(tok)
            except ValueError:
                continue
    return out


def _tounicode_codes(doc, xref: int) -> set[int]:
    """Codes the font's ToUnicode CMap already covers."""
    try:
        src = doc.xref_stream(xref).decode("latin-1")
    except Exception:
        return set()
    codes: set[int] = set()
    for m in re.finditer(r"<([0-9a-fA-F]+)>\s*<[0-9a-fA-F]{4,}>", src):
        codes.add(int(m.group(1), 16))
    for m in re.finditer(
        r"<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<[0-9a-fA-F]{4,}>", src
    ):
        lo, hi = int(m.group(1), 16), int(m.group(2), 16)
        if hi - lo < 0x10000:
            codes.update(range(lo, hi + 1))
    return codes


def build_glyph_repair(doc) -> dict[tuple[str, int], str]:
    """Scan every font in `doc`; return repairs for codes ToUnicode forgot.

    Key is `(basefont_without_subset_tag, byte_code)`.
    """
    table: dict[tuple[str, int], str] = {}
    for xref in range(1, doc.xref_length()):
        try:
            obj = doc.xref_object(xref)
        except Exception:
            continue
        if "/Type /Font" not in obj and "/Type/Font" not in obj:
            continue
        bf = re.search(r"/BaseFont\s*/([#\w\-+]+)", obj)
        enc = re.search(r"/Encoding\s+(\d+) 0 R", obj)
        if not (bf and enc):
            continue
        try:
            diffs = _parse_differences(doc.xref_object(int(enc.group(1))))
        except Exception:
            continue
        if not diffs:
            continue
        tu = re.search(r"/ToUnicode\s+(\d+) 0 R", obj)
        covered = _tounicode_codes(doc, int(tu.group(1))) if tu else set()
        name = bf.group(1).split("+")[-1]
        for code, gname in diffs.items():
            if code in covered:
                continue
            ch = glyph_name_to_char(gname)
            if ch:
                table[(name, code)] = ch
    return table


# Codes an extractor turns into U+FFFD are, in practice, the control range.
_SUSPECT = set(range(0x00, 0x20)) | {0x7F}


def repair_span(text: str, fontname: str, table: dict) -> str:
    """Replace unmapped/control characters in one span using `table`."""
    if not text:
        return text
    name = fontname.split("+")[-1]
    out = []
    for ch in text:
        cp = ord(ch)
        if cp == 0xFFFD or cp in _SUSPECT:
            rep = table.get((name, cp))
            if rep is not None:
                out.append(rep)
                continue
            if ch in ("\n", "\t", " "):
                out.append(ch)
                continue
            if cp == 0xFFFD or cp < 0x20:
                continue  # unrecoverable: drop rather than emit a tofu box
        out.append(ch)
    return "".join(out)
