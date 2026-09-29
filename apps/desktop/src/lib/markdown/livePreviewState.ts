import { StateEffect, StateField, Transaction, type Transaction as TransactionType } from "@codemirror/state";

export const POINTER_USER_EVENT = "select.pointer";

export const setLivePreviewActive = StateEffect.define<boolean>();

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

export function livePreviewActiveChanged(tr: TransactionType): boolean {
  return tr.effects.some((effect) => effect.is(setLivePreviewActive));
}
