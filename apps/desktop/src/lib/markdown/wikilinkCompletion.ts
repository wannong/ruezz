import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import type { PageSummary } from "../../api";

function wikilinkCompletions(pages: PageSummary[]): Completion[] {
  return pages.map((page) => ({
    label: page.title ?? page.id,
    detail: page.id,
    apply: (view, _completion, from, to) => {
      const id = page.id;
      view.dispatch({
        changes: { from, to, insert: `${id}]]` },
        selection: { anchor: from + id.length + 2 },
      });
    },
  }));
}

export function wikilinkAutocomplete(pages: PageSummary[]) {
  const options = wikilinkCompletions(pages);
  return autocompletion({
    override: [
      (context: CompletionContext) => {
        const match = context.matchBefore(/\[\[[^\]]*$/);
        if (!match) return null;
        const query = match.text.slice(2).toLowerCase();
        const filtered = query
          ? options.filter((item) => item.label.toLowerCase().includes(query) || item.detail?.toLowerCase().includes(query))
          : options;
        return {
          from: match.from + 2,
          options: filtered.slice(0, 12),
          validFor: /^[^\]]*$/,
        };
      },
    ],
  });
}
