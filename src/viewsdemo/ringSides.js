// Pieces arguing each answer of one ring, looked up by the server
// (/api/views-demo, {ring}): a search per answer, only pages that argue it kept,
// each with a line on what it argues, every link opened.
import { apiFetch } from '../engine/llm.js';
import { mediaInfo } from '../media.js';
import { hostOf } from '../engine/viewsDemo.js';

// One ring of a map → { reading: [{title, url, outlet, side, says, type, label}], at }.
export async function fetchRingSides(map, k) {
  const c = map?.cruxes?.[k];
  if (!c) throw new Error('No such ring');
  const res = await apiFetch('/api/views-demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ring: {
      question: map.question, crux: { question: c.question, left: c.left, right: c.right },
      holders: Object.fromEntries(['left', 'right'].map((pos) => [pos, (map.views || [])
        .filter((v) => c.positions?.[v.id] === pos)
        .map((v) => [v.who, v.summary || v.name].filter(Boolean).join(' — ').slice(0, 160))])),
      have: (c.reading || []).map((s) => s.url),
    } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Error (${res.status})`);
  const reading = (data.reading || []).map((s) => {
    const m = mediaInfo('', s.url);
    return { ...s, outlet: s.outlet || hostOf(s.url), type: m.type, label: m.label };
  });
  return { reading, at: Date.now() };
}
