// Mosaic's release notes: the one source for version numbers and for the
// What's new page (src/ui/pages/WhatsNew.jsx). Newest first.
//
// To cut a release: add an entry at the top, set package.json's "version" to
// the same number (npm version <x.y.z> --no-git-tag-version), and build.
// The build stops if the two disagree (checkReleases, run from vite.config.js).
//
// Write for the people who use Mosaic: what they can now do or will notice,
// in plain words. Kinds: 'new' (something to try), 'better' (something that
// works better), 'fixed' (something that was wrong).

export const RELEASES = [
  {
    version: '0.7.0',
    date: '2026-11-24',
    title: 'What’s new, and version numbers',
    summary: 'Mosaic now has version numbers, and this page says what changed in each one.',
    changes: [
      { kind: 'new', text: 'A What’s new page in the menu. A gold dot beside it means there’s a version you haven’t read about yet.' },
      { kind: 'new', text: 'Every version has a number, shown beside What’s new in the menu.' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-24',
    title: 'The views on a contested question',
    summary: 'When a thread asks something people really disagree about, Mosaic can lay out the views on it and the pieces that argue each one, without picking a winner.',
    changes: [
      { kind: 'new', text: 'Press Show the views under a contested question for a mandala of the views: each slice is a view, each ring a question the views answer differently.' },
      { kind: 'new', text: 'Tap a ring to see pieces that argue each answer. Every link is opened first to check it loads.' },
      { kind: 'new', text: 'The questions the views split on sit at the top of the thread’s side column. Tap one to open that ring.' },
      { kind: 'better', text: 'Tapping a view on a ring shows only the pieces on that view’s side.' },
      { kind: 'better', text: 'Each piece shows its year when it’s known, and what kind of page it is, like a preprint, a submission to a hearing or a peer-reviewed paper.' },
      { kind: 'better', text: 'Views are open to everyone who’s signed in, with a limit per person.' },
      { kind: 'better', text: 'When the model is busy, the views and a session’s four items wait and try again instead of coming back empty.' },
      { kind: 'fixed', text: 'A page is no longer filed under the answer it argues against.' },
      { kind: 'fixed', text: 'Pages that only debunk or report a claim, encyclopedia entries, forum threads and videos are no longer shown as someone’s argument.' },
      { kind: 'fixed', text: 'Old pages about a different event, like a 2008 study on a ring about the 2023 war in Gaza, no longer turn up.' },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-22',
    title: 'Better items in a session',
    summary: 'The four items in a session are chosen with more care.',
    changes: [
      { kind: 'better', text: 'Searches are shorter and stick to one idea, so fewer results are padded with LinkedIn pages and link lists.' },
      { kind: 'better', text: 'When nothing found fits a slot, Mosaic looks again instead of settling for a weak pick.' },
      { kind: 'better', text: 'A question about grief, or one that’s urgent, playful or practical, gets items in a fitting tone.' },
      { kind: 'fixed', text: 'Two slots in one session no longer pick the same person, channel or site.' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-11-18',
    title: 'Leaning on the Promenade',
    summary: 'The Promenade’s Mandala became the place you lean toward what you want to read today.',
    changes: [
      { kind: 'new', text: 'Lean on the Mandala: pick up to three fields and a depth, open a field into its four parts, choose a mood or type a hunch. Every step is optional.' },
      { kind: 'new', text: 'Today’s pieces are tiles in the Mandala. Bigger is longer, darker is denser. Tap one to open its card, with Previous and Next through the field.' },
      { kind: 'new', text: 'When a lean runs thin, Mosaic looks further on the web and adds what it finds to the day’s pieces.' },
      { kind: 'better', text: 'The Mandala fits a phone: it runs edge to edge, its labels follow the rim, and everything is easy to tap.' },
      { kind: 'better', text: 'Lengths are measured where they can be, and marked “about” where they’re estimated.' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-11',
    title: 'Quests, the reef and the Mandala',
    summary: 'New ways to hold a longer journey and to see your threads grow, all built on one idea: only real movement counts.',
    changes: [
      { kind: 'new', text: 'Quests: a long learning journey held as a conversation with a guide, who finds where you are and points you to real works at the right level.' },
      { kind: 'new', text: 'The coral reef: one colony for each thread, which grows only from sessions where your question really moved.' },
      { kind: 'new', text: 'The Mandala on the Promenade shows the day’s pieces by field and by how dense they are.' },
      { kind: 'new', text: 'A thread left untouched for 30 days goes quiet. Nothing is lost, and Mosaic offers a quiet thread back now and then.' },
      { kind: 'new', text: 'Feedback in the menu, to send a note from any page.' },
      { kind: 'new', text: 'Anyone can create an account from the sign-in screen, with a name and a password.' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-27',
    title: 'How far you got',
    summary: 'Mosaic keeps track of how much of each item you actually read, watched or listened to.',
    changes: [
      { kind: 'new', text: 'The reader records how far you got: reading time and scrolling for articles, the parts that really played for videos and podcasts.' },
      { kind: 'new', text: 'Stones in a thread’s mosaic fill up as you go, and are sized by the item’s length, from a two-minute chip to a two-hour slab.' },
      { kind: 'better', text: 'An article scrolled faster than it could be read says “skimmed”.' },
      { kind: 'better', text: 'On a phone, a Kept link at the top of a thread jumps to what you kept.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-24',
    title: 'The first Mosaic',
    summary: 'Hold a question over weeks, and restate it as your thinking moves.',
    changes: [
      { kind: 'new', text: 'Threads: questions you hold over time and restate when your thinking moves.' },
      { kind: 'new', text: 'A reading of each question: what it takes for granted and what it leaves out. You can correct it.' },
      { kind: 'new', text: 'Sessions of four items, each with a job (sharpen, complicate, bridge, ground) and a line on why it’s there.' },
      { kind: 'new', text: 'When you restate a question, Mosaic says whether it really moved or was only reworded, and the next session learns from what moved you.' },
      { kind: 'new', text: 'The Desk, the Library, a reader for items, and sharing a thread read-only with others.' },
    ],
  },
];

export const CURRENT_VERSION = RELEASES[0].version;

// Compare "x.y.z" strings: negative if a < b, 0 if equal, positive if a > b.
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// Problems with the notes, as plain sentences; empty when all is well.
export function checkReleases(pkgVersion) {
  const problems = [];
  if (pkgVersion !== RELEASES[0].version) {
    problems.push(`package.json is ${pkgVersion} but the newest release note is ${RELEASES[0].version}.`);
  }
  RELEASES.forEach((r, i) => {
    if (!/^\d+\.\d+\.\d+$/.test(r.version)) problems.push(`${r.version}: not x.y.z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) problems.push(`${r.version}: date must be YYYY-MM-DD`);
    if (!r.title || !r.changes?.length) problems.push(`${r.version}: needs a title and at least one change`);
    for (const c of r.changes || []) if (!['new', 'better', 'fixed'].includes(c.kind)) problems.push(`${r.version}: unknown kind "${c.kind}"`);
    if (i && compareVersions(RELEASES[i - 1].version, r.version) <= 0) problems.push(`${RELEASES[i - 1].version} should be newer than ${r.version} (newest first).`);
  });
  return problems;
}
