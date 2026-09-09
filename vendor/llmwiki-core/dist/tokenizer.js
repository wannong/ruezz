/**
 * CJK-aware tokenizer.
 *
 * ASCII alphanumeric runs become single lowercase word tokens; each CJK
 * ideograph / kana / hangul character becomes its own single-character token
 * (since `unicode61`-style whitespace tokenization doesn't segment Chinese).
 * NFKC normalization folds fullwidth forms first.
 */
// ASCII letter/digit runs, OR a single CJK ideograph / kana / hangul code point.
const TOKEN_RE = /[a-z0-9]+|[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
/** Tokenize text into lowercase terms, with CJK characters split individually. */
export function tokenize(text) {
    const normalized = text.normalize("NFKC").toLowerCase();
    return normalized.match(TOKEN_RE) ?? [];
}
//# sourceMappingURL=tokenizer.js.map