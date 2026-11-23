# The views section: live test, findings, and what to fix

Date: 2026-11-23. Code tested: commit `c0e87d4`.

## What was tested

The live path: `server/viewsDemo.js` → `mapLive()`, with the real Groq
(`openai/gpt-oss-120b`, `reasoning_effort: 'low'`), the real Tavily search and
the real link check. The store was isolated (`MOSAIC_DATA_DIR` in the
scratchpad), so nothing was written to the production record.

Harness: `scratchpad/viewsprobe.mjs`. It records every model call with its
status and latency, every search with its results, and every link check. Raw
output: `scratchpad/probe/batch-a.json`, `batch-b.json`.

The UI was rendered separately with a throwaway page that feeds the saved live
maps straight into `Result`, so the thread-page embed could be seen without
signing in. Screenshots: `scratchpad/shots/`.

16 questions across eight categories, weighted toward what real threads
contain. The live-usage evidence from 2026-10-08 says thread openers are
"teach me / explain / latest news", not held contested questions, and
`wantsViewsMap()` runs the auto-check on **every** new wording.

## The numbers

| Measure | Result |
|---|---|
| Questions | 15 completed |
| `mapped` | 13 |
| `none` | 2 |
| Model calls | 82 |
| …that returned 429 | **46 (56%)** |
| Mapped results with **zero** sourced views | **8 of 13** |
| Mapped results with zero articles on any ring | 3 of 13 |
| `wording.assumes` non-null | **0 of 15** |
| Link checks | 94, 12 failed |
| Latency, mapped | min 9.8s · median 39.0s · max 48.8s (deadline 55s) |

Per question:

| Category | Question | Time | Status | Views | Sourced | Rings | Articles |
|---|---|---|---|---|---|---|---|
| thread-like | Is taste learnable? | 9.8s | mapped | 4 | 0 | 4 | 8 |
| thread-like | teach me about rationality | 35.7s | mapped | 4 | 0 | 4 | 0 |
| thread-like | How do I take better photos in harsh midday light? | 0.7s | none | – | – | – | – |
| thread-like | latest news on AI agents | 40.3s | mapped | 4 | 0 | 2 | 3 |
| settled | Do vaccines cause autism? | 31.9s | mapped | 4 | 0 | 3 | 6 |
| settled | Is climate change caused by humans? | 48.8s | mapped | 4 | 0 | 3 | 0 |
| settled | Was the moon landing faked? | 48.6s | mapped | 3 | 1 | 3 | 8 |
| loaded | Why is nuclear power so dangerous? | 45.3s | mapped | 3 | 3 | 4 | 7 |
| policy | Should cities ban cars downtown? | 9.9s | mapped | 3 | 2 | 4 | 8 |
| policy | Should the UK rejoin the EU? | 47.3s | mapped | 4 | 4 | 3 | 6 |
| paraphrase | Are vaccines worth it? | 30.5s | mapped | 4 | 0 | 3 | 7 |
| hot | Was it right for Israel to invade Gaza? | 35.3s | mapped | 4 | 0 | 4 | 0 |
| none | What should I cook tonight? | 11.6s | none | – | – | – | – |
| none | How tall is Mount Everest? | 39.0s | mapped | 4 | 0 | 3 | 3 |
| niche | Is Rust better than Go for backend services? | 47.9s | mapped | 4 | 4 | 3 | 6 |

## Headline result

The feature works well on the case it was designed for: a live policy dispute
with organised sides. "Should cities ban cars downtown?" and "Should the UK
rejoin the EU?" both produced fair views, real cruxes and real sources, fast.

On everything else it fails, and it fails in the one direction that matters
most for Mosaic: **it manufactures a controversy, attributes it to named real
people and organisations it has invented, and labels the result "checked".**

Only 2 of 15 questions were declined. A factual lookup ("How tall is Mount
Everest?") became a four-way controversy. A settled question ("Was the moon
landing faked?") became three equal slices of a mandala.

## Findings, worst first

### 1. Settled questions are mapped as live controversies

`Was the moon landing faked?` → three views, equal slices, equal weight:
*Landing was real*, *Landing was staged*, *Partial hoax*.
`Do vaccines cause autism?` → four views, including *Vaccines can trigger autism*.
`Is climate change caused by humans?` → four views, including *No significant warming*.

See `scratchpad/shots/moon.png`. Three equal-area slices, each in its own
colour, under the heading "How the views split" and the line
"9 sources, each opened and checked".

The older engine (`src/engine/views.js`) had a `"settled"` status with an
explicit rule: *"Do NOT map denial as a 'view': that would be false balance."*
The newer prompt (`src/engine/viewsDemo.js` `MAP_SYSTEM`) deleted it and
replaced it with the opposite: *`"mapped"` for any question people hold
different public views on, including scientific and health questions*, with
`"none"` reserved for personal, practical or trivia questions.

So the new design has no way to say "the core of this is settled". The footer
line "none is marked right or wrong" is the bug here, not the disclaimer.

This is also the sharpest conflict with what Mosaic is for. The app exists so
people grow into thoughtful people. A symmetrical mandala over a settled
question teaches the opposite: that the matter is open.

The hand-made `vaccines.json` example already shows the better shape. It does
not map denial. It maps the live dispute *around* a settled core: school
mandates, the hep-B birth dose, the schedule's pace. That reads well and is
honest.

### 2. Holders ("who") are invented, unsourced, and shown as fact

Every view carries a **Held by** line. No sourcing, no check, no hedge.
`normalizeMap` only truncates it to 320 characters. A sample of what the model
produced:

| Map | Claimed holder | Reality |
|---|---|---|
| moon landing | "the Apollo Moon Landing Hoax Society" | No such body |
| moon landing | "former contractor Tom Sturges" | Tom Sturges is a music executive |
| moon landing | "Robert Benson (The Great Moon Hoax)" | Not the author of that work |
| vaccines/autism | "Autism Truth (Megan Miller)" | No such organisation |
| taste | "the International Society of Gastronomy" | No such body |
| taste | "World Health Organization nutrition panel" | No WHO body of that name |
| rationality | "Behavioural Science consultancy nudgestock" | Nudgestock is an Ogilvy festival |
| rationality | "Rationality coaching firms (e.g., Rationalist Community)" | Invented |
| AI agents | "some U.S. senators (e.g., Tammy Baldwin)" | No such position on record |
| Everest | "8,850 m… 2023 Nepal-China joint survey" | The 2020 joint survey gave 8,848.86 m; no 2023 survey |
| Gaza | "Amnesty International" under *Conditional military action* | Amnesty's public position is far stronger |
| Gaza | "International Court of Justice" as a view-holder | A court is not an advocate |

The prompt does say *"Name only holders you are sure of… fewer and right beats
more and wrong."* A 120B model at `reasoning_effort: 'low'` ignores it, and
nothing downstream validates it.

This is worse than a wrong summary. It puts a position in a named real person's
or body's mouth, on a page built to be shared, on topics including Gaza.

### 3. Real outlets are cited as arguing positions they argue against

On the moon-landing map, the "Staged on Earth" side of ring 2 is sourced to
**National Geographic**, with this quote shown in the pop-up
(`scratchpad/shots/moon-ring.png`):

> "You can tell Apollo was faked because … those mysterious reflections come
> from studio lights"

and this `says` line in the app's own voice:

> "Certain light patterns and reflections in Apollo photos indicate studio
> lighting, suggesting they were staged on Earth." — National Geographic

The National Geographic page debunks the claim. The same thing happened with
TIME on ring 1. The mechanism is clear: the model reads the sentence in which
an article *states the claim it is about to refute*, and promotes it to the
article's own argument. `RING_PICK_SYSTEM` asks for a page that "makes that
case", but the pick is made from a Tavily snippet, and a debunking article's
snippet contains the claim it debunks.

Two things remove the last safety net:

- `tidyReason()` strips the prefix "The page states that…", which is exactly
  the hedge that would have revealed the mistake.
- `quoteOf()` only checks the **first 60 characters** of the quote against the
  snippet. The quote above is elided with "…" and still passed.

### 4. "Views must stand on real sources" fails silently, and usually

```js
const sourced = views.filter((v) => v.reasons.length);
if (sourced.length >= 2 && cruxesFor(sourced).length) views = sourced;
```

The guard only fires when at least two views are sourced **and** those two
still disagree. Otherwise every view is kept, unsourced. That is exactly the
case where the guard is needed.

**8 of 13 mapped results had zero sourced views.** Three had no articles
anywhere: `teach me about rationality`, `Is climate change caused by humans?`
and `Was it right for Israel to invade Gaza?` — the last a four-view map of
the most sensitive topic tested, with invented holders and not one source.

Two causes, both measured:

- **Groq 429.** `pickViews()` and `pickRings()` run concurrently in
  `Promise.all`, so they collide on the rate limit. **46 of 82 model calls
  (56%) returned 429.** On the Gaza question, 6 of 8 calls were 429 and both
  pick calls were lost.
- **Link check.** On the climate question, 9 of 9 picked links failed
  `linkLoads`, so every reason was stripped and all four views survived
  unsourced.

A third, subtler case: on "Should cities ban cars downtown?", two views were
sourced but they answered every crux alike, so `cruxesFor(sourced)` was empty
and the unsourced third view was kept too.

### 5. The kicker claims a check that did not happen

```
Mapped just now · 3 views · 3 questions they split on · 9 sources, each opened and checked
```

`linkLoads()` sends one request and returns true for `res.ok` **or** for 401,
403 and 429. That is a liveness check. It never confirms the page says what it
is cited for — and finding 3 shows that it often does not. The hand-made
examples were genuinely read by hand; the live path borrows their wording.

### 6. Questions with no public sides are force-mapped

Only 2 of 15 returned `none`. The misses:

- `How tall is Mount Everest?` → four views on survey history, three of them
  built on fabricated surveys.
- `Is taste learnable?` → a four-way public controversy with institutional
  holders. No such public dispute exists.
- `teach me about rationality` → four views on *how rationality should be
  taught*, with cruxes like "What is the primary purpose of teaching
  rationality? Reduce errors / Build skills" — a false dichotomy invented to
  force a split.
- `latest news on AI agents` → four views on AI deployment policy. A real
  dispute, but not the question asked.

`How do I take better photos in harsh midday light?` was handled correctly, and
cheaply: one model call, 0.7s.

The `none` criterion in `MAP_SYSTEM` is too narrow. "Personal, practical or
trivia" misses "a real question with no public sides", which is most of what
Mosaic users actually hold.

### 7. "Notice the wording" never fires

`wording.assumes` was **null on all 15 questions**, including
`Why is nuclear power so dangerous?` — a question that plainly presupposes its
answer. The `Wording` component therefore never renders on a live map.

The leading wording did bend that map: all three views were about *how*
dangerous nuclear is, and no view raised cost or speed, which the hand-made
`nuclear.json` example treats as the real split. Nothing flagged it.

### 8. Latency sits close to the ceiling

Median 39.0s, max 48.8s, against `DEADLINE_MS` of 55s and a Vercel cap of 60s.
The 429 back-offs (`suggestedWaitMs(msg) ?? 8000`) are what push it there.

### 9. A thin result is never cached, so each retry costs full price

```js
if (!thin) await hashUpdate(...)
```

The thread UI offers "Try mapping the views again" in exactly that state. Each
click pays up to 3 Groq calls and 8 searches for the same question.

### 10. Source quality is weak even when the picker works

On the best-performing question ("Should cities ban cars downtown?"), the
articles included `rosietaxicab.com/blog/30-2`, `hashmm.com/post/...` and a
personal blog at `maxmautner.com`, each presented with a confident `says` line.
`usable()` blocks social and listing sites but nothing filters SEO blogs.

### 11. Smaller things

- **The mandala cannot be read on its own.** The key says "first answer" and
  "second answer", but which answer is first is only visible after opening a
  ring. Colour is per-view, shade is per-answer, so the reader must compare
  shades *within* a slice across rings. See `scratchpad/shots/embed-1280.png`.
- **Ring numbers all stack on the same seam** at the top of the chart, which
  reads as if they belong to the two slices they sit between.
- **A view that sits "mid" everywhere becomes a whole hatched quadrant**
  (the "Mixed" slice on the taste map). "mid" is assigned generously by the
  model, so this will be common.
- **`embedded` forces the narrow layout** (`const wide = embedded ? false : wideScreen`),
  so a desktop thread page gets the phone treatment: tabs instead of the two
  side columns, with wide empty margins. Deliberate per the comment, but it
  wastes the width.
- **The phone bottom sheet appears on desktop.** Because `wide` is false when
  embedded, tapping a view name opens `.vd-detail.sheet` — `position: fixed`,
  pinned to the bottom of the viewport, with a full-screen scrim — on a
  1280px thread page. Read from the code, not yet seen.
- **`nearby` is computed and thrown away.** `mapLive` returns 2-3 nearby
  questions for a `none` result. `ViewsPage` renders them; `ThreadViews` does
  not, and `/views` is no longer on the live site. So the one useful thing a
  `none` can offer is dead in production.
- **Neutral voice is breached by the model.** "climate-denier commentator Marc
  Morano" appeared in a `who` field. `MAP_SYSTEM` forbids rulings; nothing
  checks the output for them.
- **Ring search query is `${c.question} ${map.question}`** sliced to 200
  characters, so a long question pushes the crux out and searches the topic.
- **The headline's view count is patched by regex** on the exact phrase
  "N main views". Any other wording keeps a stale count after sourcing drops a
  view.
- **`src/ui/views/views.css` is nearly all dead.** `ThreadViews` uses only the
  `.vp-*` rules; every `.vm-*` rule belongs to `ViewsPanel.jsx`, which is no
  longer rendered.

## Fixes that need no decision

1. Run `pickViews()` then `pickRings()` in sequence instead of `Promise.all`.
   They are what collide on the rate limit.
2. Treat "no source anywhere, on any view or any ring" as `thin`, not as a map worth showing.
3. Say "found by search, each opened to check it loads" on a live map. Keep
   "opened and read" for the hand-made examples.
4. Cache the thin verdict with a short TTL so a retry is cheap.
5. Reject a ring pick whose snippet carries a refutation marker ("no evidence",
   "debunked", "conspiracy theory", "fact check", "false claim") for the side it
   was picked for.
6. Check the whole quote against the snippet, not the first 60 characters.

## What was changed (2026-11-23)

Your decisions: keep mapping denial as a view; make the views manual only;
gate "who" on sources and label it.

| Change | File | Finding |
|---|---|---|
| The auto-check is gone. The views appear only when you press the button. | `src/ui/views/ThreadViews.jsx`, `src/data/views.js` (`wantsViewsMap` removed) | 6 |
| "Held by" is shown on a live map only for a view with at least one source, labelled "Said to hold it — named by the model, not checked". Examples keep "Held by". | `src/viewsdemo/ViewsPage.jsx` (`whoOf`, `whoLabel`) | 2 |
| The two picking calls run one after the other, not side by side. They were colliding on the Groq rate limit. | `server/viewsDemo.js` | 4, 8 |
| A map with no source anywhere is `thin`, not a map worth showing. | `server/viewsDemo.js` | 4 |
| A pick — for a view or for a ring — from a page that reads as a refutation is dropped unless what it is said to argue reads as a refutation too. | `server/viewsDemo.js` (`reportedNotArgued`) | 3 |
| Sourcing no longer decides which views survive. The old "keep only sourced views" rule could delete a settled question's mainstream view, because the guard above refuses its sources most often. | `server/viewsDemo.js` | 1, 3 |
| The cache key moved from `v4:` to `v5:`, so the fixes reach questions already mapped. | `server/viewsDemo.js` | – |
| A quote must have every piece of it in the result's text, not just its first 60 characters. | `server/viewsDemo.js` (`quoteOf`) | 3 |
| A live map says "sources found by search, each opened to check it loads". Examples keep "opened and read". | `src/viewsdemo/ViewsPage.jsx` | 5 |
| A thin verdict is cached for 10 minutes, so a second click is free but a later retry still runs. | `server/viewsDemo.js` (`THIN_TTL_S`) | 9 |

### How the guard works

```js
const PAGE_REFUTES = /\b(debunk\w*|fact[- ]check\w*|conspiracy|conspiracies|hoax\w*|no evidence|false claim\w*|myth\w*|misleading|not true|disproven)\b/i;
const SAYS_REFUTES = /\b(debunk\w*|fact[- ]check\w*|no evidence|false claim\w*|not true|disproven|is a myth|was never)\b/i;
```

Two lists, not one. The page side (title, snippet and URL path) is broad,
because on a settled question the topic words themselves mark a page as being
*about* the claim rather than *for* it. The line side is narrow on purpose: the
same topic words appear in a line that states the claim — "Hoax believers say
the reflections come from studio lights" — and one shared list would wave that
straight through. Both cases are in the smoke test.

The guard is deliberately blunt. It drops good mainstream sources whose pages
carry words like "debunked" as well as the bad attributions. A wrong
attribution costs more than a lost source.

Because sourcing no longer decides which views survive, a guard refusal can no
longer delete a view. That matters most here: the smoke test now builds a
settled map where the mainstream view's only source is a debunking page, and
asserts that the mainstream view still survives.

### Verification

Four questions re-run against the fixed code, then the two settled ones again.
A small sample, and the Groq rate limit varies run to run, so read it as a
check rather than a measurement.

- **Moon landing**: 48.6s → 8.5–19.6s, and in the fastest run every model call
  returned 200. TIME, National Geographic and The Paris Review are gone from
  both the view picks and the ring picks. The only articles left are two
  genuine mainstream ones. The denial views now carry no sources, so they show
  no holder line.
- **How tall is Mount Everest?** now returns `none` with nearby questions,
  where before it was a four-view map built on fabricated surveys.
- **Rationality** and **Gaza** still showed 5 of 7 and 6 of 8 calls returning
  429 on some runs. Serialising the picks helps, but the Groq key is shared
  with the feeds, so 429s remain common. One Gaza run failed outright with a
  502 from the mapping call. That is honest behaviour, not a hollow map.
- **What still leaks**: on `Do vaccines cause autism?` the same CDC page was
  cited for two different views, with a different reading each time. Duplicate
  sources are checked per view, not across the map.

### Still open

- Finding 7: the wording check never fires. It needs a prompt change, not a fix.
- Finding 10: source quality. `usable()` blocks social and listing sites but
  not SEO blogs.
- The mandala legibility points in finding 11.
- **Maps already stored on a thread are not refreshed.** `requestViewsMap`
  writes the whole map into `thread.viewsMap`. A thread mapped before today
  keeps its old map, and once a thread is mapped the button only toggles
  Hide/Show — there is no "map it again". The cache-key bump fixes the server
  side; it does not touch what is already on a thread. Say the word if you want
  a remap button.

### What the screenshots showed

The images are not kept in the repo. Three were taken, and this is what they
showed:

- **Before, the moon-landing map.** Three equal slices, equal area, equal
  weight: *Real*, *Hoax*, *Partial hoax*. Above them the line "9 sources, each
  opened and checked". Under *Landing was staged*, the holder line read
  "Robert Benson (The Great Moon Hoax), Bill Kaysing, the Apollo Moon Landing
  Hoax Society".
- **Before, the ring pop-up on "Are the Apollo photographs authentic?"** The
  "Staged on Earth" side carried one article, credited to National Geographic,
  with the line "Certain light patterns and reflections in Apollo photos
  indicate studio lighting, suggesting they were staged on Earth" and the
  quote "You can tell Apollo was faked because … those mysterious reflections
  come from studio lights". The page it came from debunks the claim.
- **After.** The same map with the holder lines gone from both unsourced
  views, the one sourced view labelled "Said to hold it", and the kicker
  reading "9 sources found by search, each opened to check it loads".

To take them again: render `Result` from `ViewsPage.jsx` on a throwaway vite
page fed by a saved map, then `chromium --headless --screenshot`. No sign-in
needed.

## The three decisions, and what you chose (2026-11-23)

1. **Settled questions.** → *Keep mapping denial as a view.* No status was
   added. This makes the refutation guard load-bearing: a denial slice must
   carry only articles that genuinely argue the denial, never a debunking
   article relabelled. It also makes the "sourcing does not pick the views"
   change necessary, so a guard refusal can never leave the denial views
   standing alone.
2. **The auto-check.** → *Manual only.* `wantsViewsMap` is removed and the
   views appear when you press the button.
3. **`who` on live maps.** → *Gate it on sources and label it.* A live map
   shows a holder line only for a view with at least one source, under "Said to
   hold it — named by the model, not checked". The hand-made examples keep
   "Held by" as it was.
