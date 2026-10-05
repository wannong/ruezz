import type { EditorView } from "@codemirror/view";
import { StateEffect, StateField, Transaction, type Transaction as TransactionType } from "@codemirror/state";

export const POINTER_USER_EVENT = "select.pointer";

export const setLivePreviewActive = StateEffect.define<boolean>();

export type LivePreviewFocusBlock = { from: number; to: number };

export const setLivePreviewFocusBlock = StateEffect.define<LivePreviewFocusBlock | null>();

export const EMPTY_EDITABLE_RANGE = { from: 1, to: 0 };

export const livePreviewActiveField = StateField.define<boolean>({
  create: () => false,
  update(active, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLivePreviewActive)) return effect.value;
    }
    if (tr.isUserEvent(POINTER_USER_EVENT)) return true;
    if (tr.docChanged && tr.annotation(Transaction.userEvent) != null) return true;
    return active;
  },
});

export const livePreviewFocusBlockField = StateField.define<LivePreviewFocusBlock | null>({
  create: () => null,
  update(block, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLivePreviewFocusBlock)) return effect.value;
    }
    if (tr.effects.some((effect) => effect.is(setLivePreviewActive) && effect.value === false)) return null;
    return block;
  },
});

export function livePreviewActiveChanged(tr: TransactionType): boolean {
  return tr.effects.some((effect) => effect.is(setLivePreviewActive));
}

export function livePreviewFocusBlockChanged(tr: TransactionType): boolean {
  return tr.effects.some((effect) => effect.is(setLivePreviewFocusBlock));
}

/** Leave block-edit mode, collapse selection, and restore global preview. */
export function exitLivePreviewEdit(view: EditorView, pos?: number): void {
  const head = pos ?? view.state.selection.main.head;
  view.dispatch({
    effects: [setLivePreviewActive.of(false), setLivePreviewFocusBlock.of(null)],
    selection: { anchor: head, head },
    userEvent: "select.preview-exit",
  });
  window.getSelection()?.removeAllRanges();
}
