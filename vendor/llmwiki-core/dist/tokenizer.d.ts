/**
 * CJK-aware tokenizer.
 *
 * ASCII alphanumeric runs become single lowercase word tokens; each CJK
 * ideograph / kana / hangul character becomes its own single-character token
 * (since `unicode61`-style whitespace tokenization doesn't segment Chinese).
 * NFKC normalization folds fullwidth forms first.
 */
/** Tokenize text into lowercase terms, with CJK characters split individually. */
export declare function tokenize(text: string): string[];
//# sourceMappingURL=tokenizer.d.ts.map