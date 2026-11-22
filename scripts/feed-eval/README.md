# Feed eval

Goal: improve how Mosaic finds the four feed items (sharpen / complicate /
bridge / ground) for a held question, using edge-case questions that stress it.

## Run
    MOSAIC_DATA_DIR=.data npm run dev            # isolated store, port 5200
    node scripts/feed-eval/run.mjs <label>       # all cases (~26 × ~40s, conc 2)
    node scripts/feed-eval/run.mjs <label> --only specific-1,broad-1
    node scripts/feed-eval/run.mjs <label> --kind hyper-specific

Output is `runs/<label>.md` (read this) and `runs/<label>.json` (raw, includes
the candidates Tavily returned for each query). Add cases to `cases.json`.

## What the pipeline does (src/engine/feed.js, prompts.js)
readThread → per slot: LLM writes ONE search query → Tavily returns 7 results
→ LLM picks one → link check. Models never produce URLs. If retrieve→select
fails, a Wikipedia-only knowledge tier runs. The levers are the prompts:
`searchQueryPrompt`, `selectFromResultsPrompt`, `SLOT_DESCRIPTIONS`,
`slotContext`, and the logic in `fillSlot`/`runFeed`.

## Rubric (grade every item 0-2, then each feed)
Per item:
1. **Real work**: a specific video/essay/paper/thread by a specific source, not
   a listicle, SEO page, content farm, product page, or news-aggregator stub.
2. **Slot job**: does it actually sharpen / complicate / bridge / ground THIS
   question? A "complicate" that agrees with the user is a miss. A "bridge"
   that stays in the same domain is a miss.
3. **Register fit**: right depth and tone for the question (grief is not
   answered with a methods paper; a playful question is not answered with a
   dissertation).
4. **Honest why**: the `why` matches what the item really is. It admits a
   weak fit instead of spinning it.
Per feed:
5. **Variety**: four different works, sources, domains and media types. No
   near-duplicates (the same person or the same video twice).
6. **Edge-case handling**: for vague, nonsense, false-premise, over-broad or
   hyper-specific questions the feed does something sensible (narrow a broad
   question, correct a false premise gently, say plainly when little exists)
   instead of forcing a confident-looking feed.
Diagnose each miss as one of: bad QUERY, thin RETRIEVAL (candidates were
poor, so a better query was needed), bad SELECTION (a good candidate was
available but not chosen), or bad READING.
