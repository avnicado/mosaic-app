# The views mandala: second live test, with the ring items

Date: 2026-11-24. Code tested: commit `2cfe874`.
Previous round: `docs/views-review-2026-11-23.md`.

## What was tested

The thing that is new since the last review: **tapping a ring**. A ring with
fewer than two checked articles on a shown side now calls `ringSides()`
(`server/viewsDemo.js`), which writes a search per answer in that answer's own
advocates' terms, searches, keeps only pages that argue one of the two answers,
and opens every link. The thread page also grew a list of the ring questions in
its side column (`src/ui/views/RingSummary.jsx`), which opens a ring directly —
so a reader now reaches the ring pop-ups without touching the mandala at all.

Both halves ran against the real Groq (`openai/gpt-oss-120b`,
`reasoning_effort: 'low'`), the real Tavily search and the real link check, with
the store isolated by `MOSAIC_DATA_DIR` in the scratchpad. Nothing was written
to the production record.

Harness: `scripts/views-probe/` — kept in the repo this time, because this test
gets rerun. `run.sh` unsets the Upstash keys as well as setting
`MOSAIC_DATA_DIR`. It maps each question through
the client's own retry loop (four tries on `{pending: true}`), then **taps every
ring of the resulting map**, sending exactly the payload
`src/viewsdemo/ringSides.js` sends, and records every model call with its stage,
status and latency, every search with its full results, and every link check.
Raw output and metrics go wherever you point it; the run behind this review is
in the session scratchpad.

14 questions. Six are reruns from the last round, for regression. The rest were
chosen to aim at the ring lookup: an empirical crux with data on both sides, a
crux whose answer is a bare negation, the NATO/Ukraine case that forced the
`titleDenies` fix, a 2026-dated question, a question long enough that the ring
search's 200-character slice cuts the crux off, and a question with no public
sides at all.

## The numbers

| Measure | 2026-11-23 | 2026-11-24 |
|---|---|---|
| Questions | 15 | 14 |
| `mapped` | 13 | **14** |
| `none` | 2 | **0** |
| Thin maps | – | 0 |
| Model calls | 82 | 218 |
| …that returned 429 | 46 (56%) | **82 (38%)** |
| Mapped results with zero sourced views | 8 of 13 | **1 of 14** |
| Views carrying at least one source | – | **34 of 50** |
| Rings tapped | – | 46 |
| …that returned pieces for **both** answers | – | **22 (48%)** |
| …that returned pieces for **one** answer only | – | **15 (33%)** |
| …that returned **nothing** | – | **9 (20%)** |
| Ring pieces shown to a reader | – | 91, across 76 hosts |
| Ring lookup latency | – | min 2.8s · median 13.9s · max 38.6s |

Model calls by stage:

| Stage | Calls | 200 | 429 | Mean |
|---|---|---|---|---|
| map | 17 | 14 | 2 | 3.1s |
| view-pick | 31 | 14 | 17 | 1.0s |
| ring-query | 48 | 46 | 1 | 1.2s |
| **ring-pick** | **122** | **60** | **62** | 1.2s |

Per question:

| Category | Question | Map | Tries | Rings tapped | Pieces | both/one/none |
|---|---|---|---|---|---|---|
| settled | Was the moon landing faked? | mapped | 1 | 3 | 5 | 0/3/0 |
| settled | Do vaccines cause autism? | mapped | 1 | 3 | 7 | 2/0/1 |
| hot | Was it right for Israel to invade Gaza? | mapped | 1 | 3 | 6 | 1/1/1 |
| good-case | Should cities ban cars downtown? | mapped | 2 | 4 | 7 | 3/0/1 |
| niche | Is Rust better than Go for backend services? | mapped | 1 | 3 | 8 | 1/2/0 |
| loaded | Why is nuclear power so dangerous? | mapped | 2 | 4 | 9 | 3/1/0 |
| title-denies | Did NATO expansion provoke Russia's invasion of Ukraine? | mapped | 2 | 3 | 9 | 3/0/0 |
| empirical | Does raising the minimum wage cost jobs? | mapped | 2 | 3 | 5 | 1/1/1 |
| charged-medical | Are puberty blockers safe for teenagers? | mapped | 1 | 3 | 8 | 2/1/0 |
| policy | Should the UK bring back national service? | mapped | 1 | 3 | 3 | 0/2/1 |
| empirical | Is remote work bad for productivity? | mapped | 1 | 3 | 7 | 1/2/0 |
| origins | Did the COVID-19 virus come from a laboratory? | mapped | 2 | 3 | 7 | 2/1/0 |
| long | (the 240-character social-media question) | mapped | 1 | 4 | 8 | 3/0/1 |
| no-sides | Is taste learnable? | mapped | 1 | 4 | 2 | 0/1/3 |

## Headline result

**Last round's fixes held, and the ring lookup works.** The three worst failures
of 2026-11-23 are gone or much reduced: views are sourced (34 of 50, against 8
of 13 maps with nothing at all), the holder line is gated and labelled, the
refutation guard keeps debunking pages off the denial side, and the `pending`
retry path recovers maps that used to come back hollow. 91 real pieces reached
the reader across 76 hosts, most of them journals, governments, universities,
think tanks and real outlets.

**The new failure is standing, not junk.** The ring lookup finds pages that
genuinely argue a side. It has no idea what any of them is worth, and the
`outlet` line — which the model writes — can give a page more authority than it
has. On `Do vaccines cause autism?` the denial side came back better supplied
than the consensus side, three pieces to two, and one of the three was credited
to "Australian Government (APH)".

**And the pop-up is one-sided or empty more often than not.** Only 48% of tapped
rings produced pieces for both answers.

## Findings, worst first

### 1. A one-senator submission was credited to the Australian Government

`Do vaccines cause autism?`, ring 2, "Is any vaccine component biologically
plausible to cause autism?". Side B ("Plausible mechanism") came back with three
pieces:

| Credited outlet | URL | What it actually is |
|---|---|---|
| **Australian Government (APH)** | `aph.gov.au/-/media/Estimates/ca/add2526/Health_Disability_and_Ageing/03_TabledDoc_SenatorRobertsAluminumAdjuvants.pdf` | A document **tabled by one senator** at a Senate estimates hearing. The path says `TabledDoc_SenatorRoberts`. Not an Australian Government position. |
| Authorea | `authorea.com/doi/full/10.22541/au.173714739.92802154/v7` | A preprint. No peer review. |
| Journal of Scientific & Clinical Medicine | `jscimedcentral.com/...` | A low-standing publisher. |

Side A ("No plausible mechanism") came back with two: a PubMed meta-analysis and
Autism Speaks.

So on the count the reader sees, the denial side wins three to two. The ring
pop-up shows the `says` line, the outlet and the title, and nothing that says one
of these is a preprint and another is one legislator's submission.

Ring 3 repeated it: side B carried the McCullough Foundation's report hosted on
`zenodo.org` (an open deposit, no review) and the same `jscimedcentral.com`
journal, against a Statens Serum Institut study of a million Danish children.

This is the sharpest consequence of the decision of 2026-11-23 to keep mapping
denial as a view. The refutation guard stops a debunking article being
*relabelled* as denial. Nothing stops a denial side being *filled* with
preprints and submissions presented as peers of a Lancet paper.

### 2. The pieces were about a different war

`Was it right for Israel to invade Gaza?`, ring 1, "Does the invasion improve
Israeli security?". Both pieces on side A are about **Operation Cast Lead, in
2008–09**:

> "Cast Lead reduced Hamas missile attacks for several years, enhancing Israel's
> security." — Strategic Analysis
> "The operation aimed to degrade Hamas's capabilities and reduce future rocket
> threats to Israel." — Modern War Institute (Urban Warfare Project Case Study
> #14: Operation Cast Lead)

Neither is about the invasion the question is about. The same thing on the cars
question: a paper titled "Internal Combustion Engine Bans and Global Oil Use"
was placed under "Do bans significantly cut emissions?" on a map about banning
cars from city centres, with the line "ICE bans lead to significant reductions
in light-duty vehicle CO2 emissions after 2035". A ban on selling petrol engines
is a different policy.

The cause is structural: `ringPickPrompt` sent the model the ring's question and
its two answers, and **never the question the map is on**. The model had no way
to know which war or which policy was meant.

### 3. Side B of the Gaza ring was sourced to a content farm

`twisted.news` was cited on the Gaza map, over plain `http://`, credited as
"Twisted News", for "Continued civilian casualties show the invasion fuels
further violence." The second piece on that side was
`crisisgroup.org/sco/global/our-radar` — a rolling index page, not an article,
quoted as if it were one.

### 4. Pages that cannot be anyone's argument were cited as arguments

Across the run:

| Page | Placed under | What it is |
|---|---|---|
| `en.wikipedia.org/wiki/Passive_nuclear_safety` | "Yes, designs are fail-safe" | An encyclopaedia entry |
| `go.dev` | "Development speed" | A language's front page |
| `stackoverflow.com/questions/2976630/...` | "Development speed" | A Q&A thread |
| `medium.com/@amv9975/ban-cars-in-manhattan-...` | "No, too costly" | An anonymous personal post |
| `medium.com/@CodersWorld99/zero-cost-abstractions-...` | "Safety and performance" | The same |
| `snyder-associates.com/projects/...` | "Yes, easy to implement" | An engineering firm's project page |
| `corrode.dev/blog/memory-safety` | "Yes, prevents bugs" | A Rust consultancy's marketing blog |

A separate run of the same cars question, before the full batch, produced
`brainly.com/question/52757778` (a homework answer) and
`studocu.com/.../persuasive-speech-outline-banning-vehicles-in-downtown-areas`
(a student's speech outline), the latter cited for "Studies of car-free
districts show retail sales often rise". These did not recur in the batch, so
this class is intermittent rather than constant — which means it will reach a
real reader sooner or later.

### 5. The same industry page argued both sides

`Why is nuclear power so dangerous?`: `world-nuclear.org` (the nuclear
industry's trade association) was cited on ring 2 for "waste can be safely
isolated" — its own position — and on ring 3 under **"No, risk remains"**, the
sceptical answer, because the page says new designs are "orders of magnitude
less likely to suffer a core melt, but the risk is not eliminated". A trade
body's page was turned into an argument against its own industry.

### 6. Half the pop-ups show one answer with articles and the other with none

22 of 46 tapped rings gave both answers pieces. 15 gave one answer only, and 9
gave neither. Which answer goes empty is not consistent:

| Question | Ring | A shows | B shows |
|---|---|---|---|
| Was the moon landing faked? | Did humans physically walk on the Moon? | 4 | 0 |
| Do vaccines cause autism? | Do large studies show a link? | 1 | 0 |
| Was it right for Israel to invade Gaza? | Is the invasion a violation of international law? | 0 | 1 |
| Why is nuclear power so dangerous? | Is nuclear more dangerous than fossil fuels? | 0 | 2 |
| Should the UK bring back national service? | Would it boost defence readiness? | 2 | 0 |
| Should the UK bring back national service? | Is forced service compatible with civil liberties? | 0 | 2 |
| Did the COVID-19 virus come from a laboratory? | Is there evidence of genetic engineering? | 0 | 2 |
| Is remote work bad for productivity? | Do remote workers produce more output? | 2 | 0 |

On the moon-landing map every ring is one-sided toward the mainstream answer, so
the three denial slices of the mandala carry no article at all. That is honest.
It also sits under a page that promises "none of the views is marked right or
wrong", with equal-area slices. On Gaza the surviving answer is "Yes, it's
illegal aggression" and the empty one is "No, it's self-defence" — the imbalance
is the app's own, not the world's, and it is on a page built to be shared.

The empty rings are mostly honest. Of the nine, six made a successful pick call
that chose nothing, two lost the pick to the rate limit, and one got zero search
hits. So the gap is the search and the question, not the budget.

### 7. Every question was mapped. `none` never fired

0 of 14, against 2 of 15 last round. `Is taste learnable?` — named in the last
review as a question with no public sides, and named in `ThreadViews.jsx`'s own
comment as the reason the auto-check was removed — came back as a four-view map:
*Taste is largely innate*, *Taste is culturally learned*, *Taste is highly
plastic*, *Taste is a mix*. Its four rings yielded 2 pieces in total; three
returned nothing and two lost a call to the rate limit.

Its holders are the invented kind the last review documented:

- "evolutionary biologists such as Dr. John A. Carlson" — John Carlson is a Yale
  neurobiologist working on insect olfaction
- "Behavioral nutritionists such as Dr. Karen Bluth" — a real researcher, on
  self-compassion in adolescents
- "the International Food Policy Research Institute" for taste being culturally
  learned
- "the World Health Organization's nutrition advisory group" — the same
  non-existent WHO body pattern as last time

None of it reached the page: the holder gate from 2026-11-23 held, because no
view on that map carried a source. The map itself still rendered, with the
eyebrow "Contested · 4 views".

### 8. The ring pick is where the rate limit bites

62 of 122 `ring-pick` calls returned 429 — 51%, against 38% across the run and
12% on the map call. A ring lookup makes two calls (write the searches, pick the
pages) and a reader taps three or four rings in a row, so the lookups queue
against each other and against the map that just ran. `groqJSON` absorbs most of
it by retrying, at a cost in latency: median 13.9s per ring, max 38.6s.

The `ring-pick` prompt is the largest in the feature: up to 10 results at 320
characters of snippet each, and input counts toward the 8K tokens-per-minute
limit.

### 9. Smaller things

- **`ringSides` had no test at all.** `scripts/views-demo-smoke.mjs` covered
  `mapLive` and the guards; it never called `ringSides`.
- **An empty ring result was never cached.** `if (live.length) await hashUpdate(...)`.
  The pop-up offers "Try again" in exactly that state, and 20% of taps land
  there, so each retry paid for two model calls and two searches again.
- **The holder strings sent into the ring search are cut mid-word** at 160
  characters ("…to make car use optio"). They go into the model's prompt as that
  side's own words.
- **A view sitting "mid" on every ring contributes no holder to any side**, so
  one side's search falls back to the bare answer plus the map question.
- **Both sides are searched even when only one is short.** `RingDetail` computes
  `short.left` / `short.right` and then asks for the whole ring; results for the
  side that was not short are discarded.
- **Ring pieces get a medium label, map pieces do not.** `ringSides.js` runs
  `mediaInfo()` on the client for pieces fetched by tap; the pieces that came
  with the map never get one.
- **"Contested · N views"** is asserted on every map, including one the model
  invented.
- Three Groq calls failed with `UND_ERR_CONNECT_TIMEOUT` and one with a 502.
  Those are counted as lost calls, not rate limits.

## What was changed (2026-11-24)

| Change | File | Finding |
|---|---|---|
| A page that cannot be anyone's argument is never offered: an encyclopaedia entry, a Q&A or forum thread, a homework or essay-mill upload, a personal-platform post, or a site's front page. Applied in `usable()`, so it covers the view picks as well as the rings. | `src/engine/viewsDemo.js` (`notAnArgument`), `server/viewsDemo.js` | 4 |
| Every source now shows what the page is, read off its URL rather than written by the model: "Submitted to a hearing", "Preprint, not peer reviewed", "Posted to an open archive", "Peer reviewed", "Government or official body", "University". A page of lesser standing is labelled, never hidden, because Mosaic does not rule on a question. | `src/engine/viewsDemo.js` (`standingOf`), `src/viewsdemo/ViewsPage.jsx` (`SourceLink`), `src/viewsdemo/viewsdemo.css` | 1 |
| The pick call is told the question the map is on, as `About:`, and refused a page whose own subject is a different event, war, policy or decade. | `src/engine/viewsDemo.js` (`ringPickPrompt`), `server/viewsDemo.js` | 2 |
| A ring that found nothing is cached for 10 minutes, so the "Try again" in the pop-up is free while the reader is there and still looks tomorrow. | `server/viewsDemo.js` | 9 |
| Maps saved before today are filtered on read as well, so a Wikipedia entry already stored on a thread stops being shown as a side's argument. | `src/viewsdemo/ViewsPage.jsx` (`fits`) | 4 |
| The standing of a witness's filed testimony and of a transcript, both found by the replay below. | `src/engine/viewsDemo.js` (`SUBMITTED_PATH`, `TRANSCRIPT_PATH`) | 1 |
| The harness lives in the repo: the probe, the metrics and a replay that re-runs the rules over a recorded run without paying for model calls. | `scripts/views-probe/` | – |
| `ringSides` has tests: the not-an-argument filter, the standing labels, the wrong-side guard, the per-side cap, the `have` filter, the empty-result cache, a dead link, a missing answer, and the per-address cap. | `scripts/views-demo-smoke.mjs` | 9 |
| The cache keys moved to `v7:` (maps) and `r11:` (rings), so the changes reach questions already answered. | `server/viewsDemo.js` | – |

### Verification

A second live run of five questions was attempted and is **not** usable: 77% of
its model calls returned 429 and nothing mapped, so it measured the Groq quota
rather than the changes. The numbers below come instead from replaying the new
rules over the first run's own recorded bytes — every one of the 1,579 search
results and 91 shown pieces, through the new `usable()` and `standingOf()`, with
no model calls. Deterministic, and repeatable with
`node scripts/views-probe/replay.mjs <out.json>`.

**What the not-an-argument rule removes**

| | Count |
|---|---|
| Results the model was offered | 1,579 |
| …removed before it sees them | **67 (4.2%)** |
| Pieces that reached a reader | 91 |
| …now dropped | **5** |

The 67 by host: `en.wikipedia.org` 25, `medium.com` 9 (plus 3 more on
`*.medium.com`), `britannica.com` 7, `dev.to` 6, `studocu.com` 3, `go.dev` 3,
`hashmm.com` 2, `stackoverflow.com` 2, `scribd.com` 2. The 5 shown pieces
dropped are exactly the ones in finding 4: two Medium posts, `go.dev`, the Stack
Overflow thread and the Wikipedia entry.

The rule costs 4.2% of the model's choices. It removes nothing that could have
been a side's advocate.

**What the standing labels add**

47 of the 91 pieces now carry a label:

| Label | Pieces |
|---|---|
| Peer reviewed | 23 |
| University | 11 |
| Government or official body | 6 |
| Submitted to a hearing | 3 |
| Preprint, not peer reviewed | 2 |
| Posted to an open archive | 1 |
| Transcript of remarks | 1 |

Running the replay is what caught two further cases of the same laundering as
finding 1, and both are now fixed:

- `apps.legislature.ky.gov/CommitteeDocuments/.../Testimony of Matt…`, cited
  twice on the puberty-blockers map, came out labelled "Government or official
  body". It is one witness's filed testimony. `SUBMITTED_PATH` now matches
  `testimony` and `committeedocuments`, and all three such pieces read
  "Submitted to a hearing".
- `nato.int/.../transcripts/1997/04/28/…` was cited on a ring about the 2022
  invasion of Ukraine, labelled as NATO's own position. A new label,
  "Transcript of remarks", says what it is. The 1997 date is finding 2 again.

**The settled question, after the rules**

`Do vaccines cause autism?`, the map where the denial side was better supplied
than the consensus side:

| Ring | Answer | Pieces, with their labels |
|---|---|---|
| Is any component biologically plausible? | A: No plausible mechanism | Autism Speaks *(no label)* · PubMed meta-analysis **Peer reviewed** |
| | B: Plausible mechanism | Australian Government (APH) **Submitted to a hearing** · Authorea **Preprint, not peer reviewed** |
| Should policy rely on existing evidence? | A: Maintain current schedules | Statens Serum Institut *(no label)* |
| | B: Delay or limit vaccines | McCullough Foundation **Posted to an open archive** · JSCiMED *(no label)* |

The counts are now 2–2 and 1–2. The labels, not the counts, carry the weight: a
reader sees that one side rests on a meta-analysis and the other on a
submission, a preprint and an open deposit. That is the shape your decision of
2026-11-23 asks for — the denial view is still mapped, and nothing rules on it.

Two gaps the table shows:

- `jscimedcentral.com`, a low-standing publisher, gets no label, because a
  hostname does not say so.
- `en.ssi.dk` is Denmark's state serum institute and gets no label, because the
  government pattern keys on `.gov`, `.gov.xx` and a short list of
  international bodies. Non-Anglophone state domains are missed.

## Decisions for you

These three need your call. I have not acted on them.

1. **The denial side's standing (finding 1).** The labels now tell the reader
   that a piece is a preprint or a hearing submission. They do not stop the
   denial side of a settled medical question coming back with more pieces than
   the consensus side. The options: leave it as labelled-and-shown, which is
   what your decision of 2026-11-23 implies; or cap a side at the standing of
   its best piece, so a side holding only preprints shows one piece rather than
   three; or say on the ring that one side's pieces are all of lesser standing.
2. **One-sided pop-ups (finding 6).** Half of them show one answer with
   articles and the other with none, and nothing on the page says whether that
   is the world or the search. The options: say it plainly on the ring ("nothing
   arguing this answer turned up — that may be the search, not the question");
   or hold the pieces back until both answers have one, which costs the honest
   cases; or leave it.
3. **`none` never fires (finding 7).** The map prompt's `none` criterion is
   still "personal, practical or trivia". "Is taste learnable?" is none of
   those and has no public sides either. Changing it is a prompt change with a
   real risk of refusing questions that do have sides.

## Second round of changes (2026-11-24, after your notes)

Your three notes: the year is ignored everywhere, including in the four-item
feed; both sides of a ring should have pieces; and you are moving to the paid
Claude API, so the model's own weakness matters less than the plumbing.

### The year: one missing flag broke it in three places

`tavilySearch` never asked Tavily for a publish date. Measured on the recorded
run: **`published` was null on 1,579 of 1,579 results — 100%.** Tavily returns
`published_date` only when `include_published_date` is true, which it sets
automatically for `topic: "news"` and never for the general searches this app
makes. So:

- `server/further.js` `toItem()` took its fallback every single time:
  `timestamp: Number.isFinite(ts) && ts <= now ? ts : now`. **Every searched
  item in the four-item feed was stamped with the moment it was found.** A 2013
  paper looked like it appeared today, and `modelEngagement` modelled it as new.
- The views' `date` was always `''`, so `fmtDate(s.date)` in `SourceLink`
  rendered nothing. The feature has a date line and it had never once shown.
- Neither pick prompt carried a date, so the model could not weigh one. That is
  why a 1997 NATO transcript was cited on a ring about the 2022 invasion of
  Ukraine, and why a 2008 Operation Cast Lead study was cited on a 2023 Gaza
  ring (finding 2).

| Change | File |
|---|---|
| The search asks for the publish date, and takes `startDate` / `endDate` / `timeRange` to filter on it. | `server/proxyCore.js` (`tavilySearch`) |
| `dateOf()` reads Tavily's date, and falls back to a date in the URL or at the head of the snippet. A bare year in a **title** is deliberately not read: titles name years they only discuss, which is how "…Bans and Global Oil Use" would have been dated 2035. | `src/engine/viewsDemo.js` |
| Every line of both pick prompts carries the date, or says "date unknown", and both systems are told the date is part of the judgement: a page written before the events cannot argue about them; prefer the recent where the question is live; pick none where the date is unknown and the period decides it. | `src/engine/viewsDemo.js` |
| The reader sees the date on every source, with the URL read for a year when a map was saved before the search asked for one. | `src/viewsdemo/ViewsPage.jsx` |
| A searched item keeps `published` as its own field, separate from `timestamp`. `timestamp` is when we found it and is no longer presented as a date. | `server/further.js` |
| The item card shows the year when it is really known. The four-item feed never showed a date at all. | `src/ui/thread/ItemCard.jsx` |
| The item classifier is told the publish date. | `src/scoring.js` (`buildClassifyPrompt`) |

**The flag is not verified against the live API.** It is read from Tavily's
official OpenAPI spec, which states `include_published_date` is a boolean,
default false, "Include a `published_date` field in each result", "Automatically
enabled when `topic` is `news`", and marked beta. It has no stated restriction
to news. The probe burned through the Tavily plan's usage limit, so every live
call now returns HTTP 432, and I could not confirm the response. **Check this
first on the next live run:** that `published` is non-null on a good share of
results. The field is beta and documented as null when no date is detected, so
the URL fallback stays either way. On the recorded run that fallback alone
covers 16% of results.

### Both sides get pieces

The query call now writes **two** searches per answer: the first in that side's
advocates' own terms, and a second that would reach the same side through quite
different words — another field's vocabulary, another kind of writer, another
country's debate, sharing no distinctive word with the first. The first round
uses the first wording, as before.

If an answer comes back with nothing, it gets a second round: one more search
with that answer's fallback wording, then one more picking call, told which
answers are still open and told to return nothing rather than a page that does
not argue them. Only the empty answers can gain a piece, so a side that already
has two is untouched. The whole second round sits behind a time check
(16 seconds of headroom to search, 13 to pick) and inside a `try/catch`, so it
can never cost what the first round already found.

Cost: one extra search per empty answer and one extra model call, and only when
a side is empty. The fallback wording is free, because it comes from the query
call that already runs.

Measured on the live run's rings: 15 of 46 had exactly one empty side and 9 had
two, so the second round would have fired on 24 of 46 taps. How many it fills is
not known, and cannot be known without a live run — see the Tavily note above.
`ring-pick` was already the stage taking 51% of the 429s, and this adds a call
to it on half of all taps. **Watch the 429 rate on the next run.** If it rises,
the lever is the pick prompt's size (10 results at 320 characters), not the
second round.

### Not changed, and why

The second round does **not** lower the bar for an empty side. It searches
again; it does not accept a weaker page. A side with nothing is still shown with
nothing, because the alternative is to put a page under an answer it does not
argue, which is finding 2 all over again.

## Still open

- Source standing beyond the URL. `world-nuclear.org` is a trade body and
  `cato.org`, `epi.org` and `epionline.org` are advocacy organisations; nothing
  says so, and `standingOf` has no honest way to tell from a hostname.
- Finding 5: a page used to argue against its own side.
- Finding 8: the `ring-pick` prompt's size. Cutting it from 10 results to 6, or
  the snippets from 320 characters to 200, is the measured lever on the 429
  rate; neither was changed here, because it trades pick quality for latency and
  wants its own measurement.
- Finding 7's wording check (`wording.assumes`) still fired on 0 of 14,
  including "Why is nuclear power so dangerous?". Unchanged from last round.
- The holder truncation and the mid-only-view gap in finding 9.
- The mandala legibility points from the 2026-11-23 review, finding 11.
- **A map already on a thread is still never refreshed.** The key bump fixes the
  server; `thread.viewsMap` keeps its old map, and the button only toggles
  Hide/Show. There is still no remap button.

## How to run it again

```bash
./scripts/views-probe/run.sh /tmp/batch.json 0 14   # all 14 questions, ~25 min
python3 -I scripts/views-probe/analyze.py /tmp/batch.json > /tmp/report.txt
node scripts/views-probe/replay.mjs /tmp/batch.json # new rules, recorded bytes
node scripts/views-demo-smoke.mjs                   # the stubbed path, 1 second
```

`run.sh` sets `MOSAIC_DATA_DIR` (override with `VIEWS_PROBE_STORE`) and unsets
every Upstash key, so the production record is never touched. It loads the live
Groq and Tavily keys from `app/.env`. No sign-in is needed.

**Run the replay before paying for a second live run.** The Groq key is shared
with the feeds and has an 8K tokens-per-minute budget; a full 14-question probe
leaves it too thin for a verification run in the same hour, which is how the
one above came back at 77% rate-limited and worthless.
