#!/usr/bin/env python3
# Metrics over a viewsprobe run. Run: python3 -I analyze.py out/batch.json
import json, sys, re
from collections import Counter
from urllib.parse import urlparse

d = json.load(open(sys.argv[1]))
res = d['results']

def host(u):
    try:
        return urlparse(u).hostname.replace('www.', '')
    except Exception:
        return ''

print('=' * 78)
print('PER QUESTION')
print('=' * 78)
hdr = f"{'cat':16} {'question':46} {'map':7} {'tr':2} {'s':>4} {'calls':>5} {'429':>4} {'rings':>5} {'fired':>5} {'piece':>5} {'L/R-bal':>8}"
print(hdr)
tot = Counter()
rows = []
for r in res:
    m = r['map'] or {}
    st = ('ERR' if r['error'] and not m else m.get('status', '?')) + ('*' if m.get('thin') else '')
    n429 = sum(1 for x in r['llm'] if x['status'] == 429)
    fired = [e for e in r['rings'] if e['fired']]
    pieces = sum(len(e['reading'] or []) for e in fired)
    bal = sum(1 for e in fired if e['reading'] and len({x['side'] for x in e['reading']}) == 2)
    one = sum(1 for e in fired if e['reading'] and len({x['side'] for x in e['reading']}) == 1)
    zero = sum(1 for e in fired if not e['reading'])
    errs = sum(1 for e in fired if e['error'])
    print(f"{r['cat'][:16]:16} {r['q'][:46]:46} {st:7} {r['tries']:2} {round(r['ms']/1000):>4} {len(r['llm']):>5} {n429:>4} {len(r['rings']):>5} {len(fired):>5} {pieces:>5} {bal}/{one}/{zero}/{errs:>2}")
    tot['q'] += 1
    tot[st.replace('*', '')] += 1
    tot['thin'] += 1 if m.get('thin') else 0
    tot['calls'] += len(r['llm'])
    tot['429'] += n429
    tot['searches'] += len(r['search'])
    tot['rings'] += len(r['rings'])
    tot['fired'] += len(fired)
    tot['pieces'] += pieces
    tot['bal'] += bal
    tot['one'] += one
    tot['zero'] += zero
    tot['ringerr'] += errs
    tot['mapms'] += r['ms']
    rows.append(r)

print()
print('bal/one/zero/err = fired rings with both sides / one side only / nothing / an error')
print()
print('=' * 78)
print('TOTALS')
print('=' * 78)
for k in ['q', 'mapped', 'none', 'ERR', 'thin', 'calls', '429', 'searches', 'rings', 'fired', 'pieces', 'bal', 'one', 'zero', 'ringerr']:
    print(f'  {k:10} {tot[k]}')
if tot['calls']:
    print(f"  429 rate   {100*tot['429']/tot['calls']:.0f}%")
if tot['fired']:
    print(f"  rings that gave both sides  {100*tot['bal']/tot['fired']:.0f}%")
    print(f"  rings that gave nothing     {100*tot['zero']/tot['fired']:.0f}%")

# 429 by stage
print()
print('MODEL CALLS BY STAGE')
by = {}
for r in res:
    for x in r['llm']:
        s = by.setdefault(x['stage'], Counter())
        s['n'] += 1
        s[str(x['status'])] += 1
        s['ms'] += x['ms']
for k, v in sorted(by.items()):
    print(f"  {k:12} n={v['n']:4}  200={v['200']:4}  429={v['429']:4}  other={v['n']-v['200']-v['429']:3}  mean {round(v['ms']/max(v['n'],1)/1000,1)}s")

# ring latency
print()
print('RING LOOKUP LATENCY (fired)')
ms = sorted(e['ms'] for r in res for e in r['rings'] if e['fired'])
if ms:
    print(f'  n={len(ms)} min={ms[0]/1000:.1f}s median={ms[len(ms)//2]/1000:.1f}s max={ms[-1]/1000:.1f}s')

# hosts of every ring piece
print()
print('=' * 78)
print('RING PIECE HOSTS (every piece shown to a reader)')
print('=' * 78)
hc = Counter()
pieces = []
for r in res:
    for e in r['rings']:
        for x in (e['reading'] or []):
            hc[host(x['url'])] += 1
            pieces.append((r['q'], e['question'], e['left'], e['right'], x))
for h, n in hc.most_common():
    print(f'  {n:3}  {h}')
print(f'  --- {len(pieces)} pieces, {len(hc)} distinct hosts')

# junk-class candidates
JUNK = re.compile(r'(^|\.)(brainly|studocu|coursehero|chegg|scribd|quizlet|bartleby|studymode|123helpme|gradesfixer|ivypanda|studycorgi|cram|enotes|sparknotes|answers|numerade|vaia|studysmarter|docsity|studylib|coursesidekick|papersowl|edubirdie|ukessays|bachelorprint|slideshare|academia|researchgate|coursemerit|homeworklib|transtutors|sawaal|toppr|vedantu|byjus|shaalaa|doubtnut|careers360|collegedunia)\.', re.I)
print()
print('PIECES FROM HOMEWORK / ESSAY / STUDY-NOTE HOSTS')
n = 0
for q, cq, l, rr, x in pieces:
    if JUNK.search(host(x['url']) + '.'):
        n += 1
        print(f"  {host(x['url']):22} {x['side']:5} {x['url'][:95]}")
        print(f"     ring: {cq[:70]}")
        print(f"     says: {x['says'][:110]}")
print(f'  --- {n} of {len(pieces)}')

# outlet vs host mismatch
print()
print('OUTLET THE MODEL WROTE vs THE HOST IT CAME FROM')
def toks(s):
    return {w for w in re.split(r'[^a-z0-9]+', s.lower()) if len(w) >= 4}
mis = 0
for q, cq, l, rr, x in pieces:
    h = host(x['url'])
    hw = toks(h.rsplit('.', 1)[0] if h else '')
    ow = toks(x.get('outlet', ''))
    tw = toks(x.get('title', ''))
    if ow and not (ow & hw) and not (ow & tw):
        mis += 1
        print(f"  {x.get('outlet','')[:40]:40} <- {h}")
print(f'  --- {mis} of {len(pieces)} outlets share no word with the host or the title')

# one-sided rings in detail
print()
print('=' * 78)
print('ONE-SIDED AND EMPTY RINGS')
print('=' * 78)
for r in res:
    for e in r['rings']:
        if not e['fired']:
            continue
        sides = Counter(x['side'] for x in (e['reading'] or []))
        tot_c = {p: e['checked'][p] for p in ('left', 'right')}
        shownL = tot_c['left'] + sides['left']
        shownR = tot_c['right'] + sides['right']
        if shownL == 0 or shownR == 0:
            flag = 'EMPTY' if shownL == 0 and shownR == 0 else 'ONE-SIDED'
            print(f"  [{flag}] {r['q'][:40]}")
            print(f"     ring: {e['question'][:72]}")
            print(f"     A={e['left'][:28]!r} shows {shownL}   B={e['right'][:28]!r} shows {shownR}" + (f"   err={e['error'][:50]}" if e['error'] else ''))

# the searches the model wrote for each side
print()
print('=' * 78)
print('THE SEARCH THE MODEL WROTE FOR EACH SIDE (ring lookups)')
print('=' * 78)
for r in res:
    for e in r['rings']:
        if not e['fired']:
            continue
        qs = [s for s in r['search'] if s['phase'] == f"ring{e['k']}"]
        if not qs:
            continue
        print(f"  {r['q'][:38]:38} | {e['question'][:40]}")
        for s in qs:
            print(f"      {s['n']:2} hits  {s['query'][:100]}")

print()
print('=' * 78)
print('WORDING CHECK (finding 7 of the 2026-11-23 review)')
print('=' * 78)
for r in res:
    m = r['map'] or {}
    w = (m.get('wording') or {})
    print(f"  {r['q'][:52]:52} assumes={w.get('assumes') if w.get('assumes') else None}")

print()
print('=' * 78)
print('HOLDER STRINGS SENT INTO THE RING SEARCH (truncated at 160?)')
print('=' * 78)
seen = set()
for r in res:
    for e in r['rings']:
        p = e.get('payload') or {}
        for pos in ('left', 'right'):
            for h in (p.get('holders', {}).get(pos) or []):
                if h in seen:
                    continue
                seen.add(h)
                cut = len(h) >= 158 and not h.rstrip().endswith('.')
                print(f"  {'CUT ' if cut else '    '}{h[:150]}")
        if not (p.get('holders', {}).get('left') or []) or not (p.get('holders', {}).get('right') or []):
            print(f"  !! no holders on one side: ring {e['k']+1} of {r['q'][:40]} L={len(p.get('holders',{}).get('left') or [])} R={len(p.get('holders',{}).get('right') or [])}")

print()
print('=' * 78)
print('EVERY RING PIECE, FOR THE AUDIT')
print('=' * 78)
for r in res:
    for e in r['rings']:
        if not (e['reading'] or []):
            continue
        print(f"\nQ: {r['q'][:70]}")
        print(f"RING {e['k']+1}: {e['question']}   A={e['left']!r}  B={e['right']!r}")
        for x in e['reading']:
            print(f"  [{ 'A' if x['side']=='left' else 'B' }] {x['outlet']}  <{x['url']}>")
            print(f"      title: {x.get('title','')[:120]}")
            print(f"      says : {x['says'][:160]}")
            if x.get('quote'):
                print(f"      quote: {x['quote'][:120]}")
