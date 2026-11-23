# Mosaic (app)

A personal inquiry tool. You hold questions — *threads* — over weeks and restate
them as your thinking moves. For each thread Mosaic reads the question back
(what it takes for granted, what it leaves out — and you can correct it),
composes four items that each do a different job (**sharpen**, **complicate**,
**bridge**, **ground**) and say why they're there, and, when you restate,
judges whether the question really moved or was only reworded. The next feed
is shaped by what moved you.

This is the daily-use app. The original demo and pitch site live untouched in
`../src/`.

## Run it

```bash
npm install
cp .env.example .env    # fill in GROQ_API_KEY and TAVILY_API_KEY
npm run dev             # http://localhost:5200
```

The dev server mounts the real route handlers in `server/routes/` (same code
as production, where they all run through one function, `api/[route].js`, to
stay under the Hobby plan's 12-function limit). Without Upstash env vars the record is stored in `.data/`.

**Claude fallback (local only).** If Groq is missing, down or rate-limited, the
local server answers with `claude -p --model sonnet` (the Claude Code CLI on this
machine; images go through a temp file and the Read tool). `LLM_BACKEND=claude`
forces it; `LLM_FALLBACK=off` disables it. `/api/session` reports which is active.

**People.** You're the owner (sign in with `APP_PASSWORD`; leave the name empty).
Anyone can create an account from the sign-in screen (name + password, no
email); set `OPEN_SIGNUP=off` to close it. Settings → People also creates
one-time invite links (7 days). No cap on people unless `MAX_USERS` is set.
Each person has a private record. Any thread can be shared
read-only with the others from its page ("Share with others"). Locally without
`APP_PASSWORD` there is no sign-in and you are the owner.

## Layout

| Path | What |
|---|---|
| `src/engine/` | Pure logic, no React: `llm.js` (proxy calls, JSON repair, retries), `prompts.js`, `feed.js` (retrieve→select slot filling; models never produce URLs), `thread.js` (reading, image start, movement judgement, effect history). `npm run engine-smoke` runs it headlessly against a dev server. |
| `src/data/` | The record (`record.js`: threads / sessions / items as documents), `actions.js` (engine applied to the record, every step persisted), `hooks.js`. |
| `src/sync.js` | Mirrors every `m2:*` localStorage key to `/api/store`; pulls at boot; retries offline writes. |
| `src/ui/` | Sidebar shell, router, pages: Desk, Thread, New thread, Promenade, Library, Settings. |
| `src/ui/promenade/` | The Promenade. The Mandala is where you lean (fields, parts, depth, a mood from the four moves, a hunch), all optional; `scoring.js`'s `composeLeanShelf` sets out five cards from the lit area only. With no lean the shelf is the open one (Near / Far / Open questions) the Desk reads. `node scripts/lean-smoke.mjs` checks the lean rules. |
| `src/ui/views/`, `src/engine/views.js`, `server/views.js` | The views mandala, **admin (owner) only** for now. On a contested question it maps the views by their cruxes (specific claims they answer differently, not values they all claim): slices are views, rings are cruxes, cells are answers. A new wording is checked once, after its feed; older threads have a "Show the views" button. At most 2 Groq calls and one Tavily search per view per question, cached in the store; `/api/views` refuses anyone but the owner. `node scripts/views-smoke.mjs` checks it with stubs. |
| `src/viewsdemo/`, `src/engine/viewsDemo.js`, `server/viewsDemo.js` | The newer views (mandala, ring pop-ups, real articles), shown under a contested thread's question, **owner only** for now. Three ready examples (`src/viewsdemo/examples/*.json`) cost nothing to show; any other question goes to `/api/views-demo` (owner only): 2 Groq calls, a Tavily search per view, every picked link opened, cached, capped per hour and per day (`VIEWS_DEMO_PER_HOUR`, `VIEWS_DEMO_PER_DAY`). The standalone /views page lives on the `claude/project-thread-3ayker` branch and is not built here. `node scripts/views-demo-smoke.mjs` checks it with stubs. |
| `api/[route].js`, `server/routes/`, `server/` | Groq proxy (allowlisted models), Tavily search, link checks, record store (Upstash or file), single-password auth, daily Promenade corpus. |

## Deploy

Deploy as a **new** Vercel project (this folder has no `.vercel` link on purpose):
set `GROQ_API_KEY`, `TAVILY_API_KEY`, `APP_PASSWORD`, connect Upstash Redis,
optionally `CRON_SECRET`, then `vercel --prod` from this folder.
