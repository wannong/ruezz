export type FrontmatterValue = string | string[];
export interface FrontmatterParseResult {
    frontmatter: Record<string, FrontmatterValue> | null;
    body: string;
    /**
     * The literal frontmatter block (opening `---`, YAML payload, closing `---`,
     * and the separating newlines) exactly as it appeared in the input. Empty when
     * there is no frontmatter. Body-only transforms write back `rawBlock + body`
     * so user-managed YAML survives untouched.
     */
    rawBlock: string;
}
export declare function parseFrontmatter(content: string): FrontmatterParseResult;
//# sourceMappingURL=frontmatter.d.ts.map