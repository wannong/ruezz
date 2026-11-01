import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { createWysiwygExtensions } from "./wysiwygExtensions.ts";

let cached: Schema | null = null;

/** The editor schema, shared so tests can validate converted documents. */
export function wysiwygSchema(): Schema {
  if (!cached) cached = getSchema(createWysiwygExtensions());
  return cached;
}
