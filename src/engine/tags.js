// Field and topic tags for items saved before feeds asked for them. One call
// tags a batch; the vocabulary of tags already in use is passed along so the
// same subject gets the same tag across items (that is what makes overlap
// between items visible at all).
import { callLLMJSON } from './llm.js';
import { tagItemsPrompt } from './prompts.js';
import { normalizeField, normalizeTopics, normalizeMediaType } from '../media.js';

export async function tagItems(items, vocab = []) {
  if (!items.length) return [];
  const out = await callLLMJSON({ prompt: tagItemsPrompt(items, vocab), maxTokens: 400 + 90 * items.length });
  const tags = Array.isArray(out?.tags) ? out.tags : Array.isArray(out) ? out : [];
  return items.map((it, k) => {
    const t = tags.find((x) => Number(x?.i) === k + 1) || tags[k] || {};
    return {
      field: normalizeField(t.field),
      topics: normalizeTopics(t.topics),
      mediaType: normalizeMediaType(t.mediaType || it.mediaType, it.url),
    };
  });
}

// Topics already in use, most-used first.
export function vocabulary(items, n = 40) {
  const count = new Map();
  for (const i of items) for (const t of i.topics || []) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
}
