// ============================================================
// SHARED GROUND + MOSS ART  (in-code, no binary deps)
// ============================================================
// Split out of courtyardAssets.js so the mosaic — which needs only the packed
// earth it is laid on and the moss that creeps over a neglected panel — does
// not drag in the courtyard's stones, fence and scenery.
//
//   CM_GROUND_DEFS — the packed-earth floor (<g id="cm-ground">)
//   CM_MOSS_DEFS   — moss overlays cm-moss-1..6, genuinely green (never tinted)
//
// No filters on the moss, hard-edged flat planes only; the softness lives in
// the ground. All ids are cm- prefixed and globally unique.

// Packed-earth courtyard floor.
export const CM_GROUND_DEFS = `<defs>
  <!-- ============ gradients ============ -->
  <radialGradient id="cm-base-grad" cx="50%" cy="42%" r="85%">
    <stop offset="0%"  stop-color="#f5efe0"/>
    <stop offset="45%" stop-color="#f1e9d6"/>
    <stop offset="78%" stop-color="#ece1ca"/>
    <stop offset="100%" stop-color="#e6dabf"/>
  </radialGradient>

  <!-- top haze (ground recedes) fading to a faint deepening at the near edge -->
  <linearGradient id="cm-recede-grad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"   stop-color="#fffaf0" stop-opacity="0.22"/>
    <stop offset="26%"  stop-color="#fffaf0" stop-opacity="0"/>
    <stop offset="72%"  stop-color="#7a684c" stop-opacity="0"/>
    <stop offset="100%" stop-color="#7a684c" stop-opacity="0.055"/>
  </linearGradient>

  <!-- soft vignette; objectBoundingBox keeps it elliptical for the wide floor -->
  <radialGradient id="cm-vignette-grad" cx="50%" cy="46%" r="74%">
    <stop offset="0%"   stop-color="#6b5a3e" stop-opacity="0"/>
    <stop offset="58%"  stop-color="#6b5a3e" stop-opacity="0"/>
    <stop offset="86%"  stop-color="#6b5a3e" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="#65563a" stop-opacity="0.135"/>
  </radialGradient>

  <!-- ============ noise filters ============ -->
  <!-- pervasive fine sand tone -->
  <filter id="cm-grit-fine" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="17" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0.9 0 -1.02" result="a"/>
    <feFlood flood-color="#8a795c" flood-opacity="0.11"/>
    <feComposite operator="in" in2="a"/>
  </filter>

  <!-- broad organic mottling, slightly darker earth -->
  <filter id="cm-mottle-dark" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.010 0.016" numOctaves="3" seed="23" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.55 0.55 0.55 0 -0.42" result="a"/>
    <feFlood flood-color="#9c8b68" flood-opacity="0.15"/>
    <feComposite operator="in" in2="a"/>
  </filter>

  <!-- broad pale chalky patches, different grain -->
  <filter id="cm-mottle-light" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.014 0.009" numOctaves="3" seed="61" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.55 0.55 0.55 0 -0.5" result="a"/>
    <feFlood flood-color="#fbf5e7" flood-opacity="0.30"/>
    <feComposite operator="in" in2="a"/>
  </filter>

  <!-- sparse darker sand grains -->
  <filter id="cm-grit-dark" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="7" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 1.6 1.6 0 -3.05" result="a"/>
    <feFlood flood-color="#6f5f45" flood-opacity="0.27"/>
    <feComposite operator="in" in2="a"/>
  </filter>

  <!-- rare bright mica glints -->
  <filter id="cm-grit-glint" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="2" seed="41" stitchTiles="stitch" result="n"/>
    <feColorMatrix in="n" type="matrix"
      values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.7 1.7 1.7 0 -3.35" result="a"/>
    <feFlood flood-color="#fffaf0" flood-opacity="0.42"/>
    <feComposite operator="in" in2="a"/>
  </filter>

  <!-- ============ softening blurs ============ -->
  <filter id="cm-clump-soft" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
  <filter id="cm-patch-soft" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="4.5"/>
  </filter>
  <filter id="cm-peb-soft" x="-120%" y="-120%" width="340%" height="340%">
    <feGaussianBlur stdDeviation="0.45"/>
  </filter>

  <!-- ============ the ground ============ -->
  <g id="cm-ground">
    <!-- base earth -->
    <rect x="0" y="0" width="1000" height="420" fill="url(#cm-base-grad)"/>

    <!-- fine sand grain everywhere -->
    <rect x="0" y="0" width="1000" height="420" filter="url(#cm-grit-fine)"/>

    <!-- organic tonal mottling -->
    <rect x="0" y="0" width="1000" height="420" filter="url(#cm-mottle-dark)"/>
    <rect x="0" y="0" width="1000" height="420" filter="url(#cm-mottle-light)"/>

    <!-- troweled / packed patches: broad, very soft, hand-placed -->
    <g filter="url(#cm-clump-soft)">
      <ellipse cx="218" cy="128" rx="120" ry="52" fill="#b3a37e" opacity="0.075" transform="rotate(-7 218 128)"/>
      <ellipse cx="705" cy="96"  rx="150" ry="46" fill="#f8f1df" opacity="0.16" transform="rotate(4 705 96)"/>
      <ellipse cx="512" cy="252" rx="170" ry="62" fill="#a8976f" opacity="0.055" transform="rotate(-3 512 252)"/>
      <ellipse cx="132" cy="330" rx="110" ry="48" fill="#f7efdc" opacity="0.13" transform="rotate(6 132 330)"/>
      <ellipse cx="866" cy="300" rx="130" ry="56" fill="#ab9a74" opacity="0.07" transform="rotate(-5 866 300)"/>
      <ellipse cx="392" cy="66"  rx="96"  ry="34" fill="#b0a07a" opacity="0.05" transform="rotate(3 392 66)"/>
      <ellipse cx="620" cy="376" rx="140" ry="40" fill="#a2916a" opacity="0.06" transform="rotate(2 620 376)"/>
    </g>

    <!-- smaller settled clumps of earth -->
    <g filter="url(#cm-patch-soft)">
      <path d="M300 205 q26 -14 52 -4 q20 8 10 22 q-16 16 -44 10 q-26 -7 -18 -28 z" fill="#a4936d" opacity="0.085"/>
      <path d="M760 208 q22 -10 44 0 q16 8 6 19 q-14 12 -36 7 q-24 -6 -14 -26 z" fill="#9f8e68" opacity="0.075"/>
      <path d="M118 84 q18 -10 38 -2 q14 6 6 16 q-12 11 -32 6 q-20 -5 -12 -20 z" fill="#a79671" opacity="0.07"/>
      <path d="M556 138 q20 -8 38 2 q12 8 2 16 q-14 9 -32 4 q-18 -6 -8 -22 z" fill="#f9f2e0" opacity="0.16"/>
      <path d="M872 152 q18 -9 36 0 q13 7 4 16 q-13 10 -31 5 q-19 -5 -9 -21 z" fill="#f8f1de" opacity="0.13"/>
      <path d="M244 288 q20 -9 40 -1 q14 7 4 17 q-13 10 -33 5 q-21 -5 -11 -21 z" fill="#a1906a" opacity="0.07"/>
      <path d="M448 348 q22 -10 42 0 q15 7 5 17 q-15 11 -35 6 q-22 -6 -12 -23 z" fill="#f8f1df" opacity="0.12"/>
    </g>

    <!-- the faintest swept texture: broom traces, two quiet fans -->
    <g fill="none" stroke-linecap="round">
      <g stroke="#8c7a58" stroke-width="1.1" opacity="0.05">
        <path d="M96 258 Q 250 240 404 254"/>
        <path d="M88 276 Q 252 256 416 272"/>
        <path d="M102 294 Q 256 274 408 290"/>
        <path d="M116 312 Q 262 292 396 308"/>
      </g>
      <g stroke="#fdf7ea" stroke-width="1.1" opacity="0.07">
        <path d="M96 262 Q 250 244 404 258"/>
        <path d="M88 280 Q 252 260 416 276"/>
        <path d="M102 298 Q 256 278 408 294"/>
      </g>
      <g stroke="#8c7a58" stroke-width="1" opacity="0.045">
        <path d="M600 120 Q 748 104 902 122"/>
        <path d="M594 138 Q 750 118 908 138"/>
        <path d="M604 156 Q 752 136 898 154"/>
      </g>
      <g stroke="#fdf7ea" stroke-width="1" opacity="0.06">
        <path d="M600 124 Q 748 108 902 126"/>
        <path d="M594 142 Q 750 122 908 142"/>
      </g>
    </g>

    <!-- hairline dry-earth cracks, barely there -->
    <g fill="none" stroke="#7a684a" stroke-linecap="round" stroke-linejoin="round">
      <path d="M628 178 l13 8 l5 11 l12 6 l4 9" stroke-width="0.7" opacity="0.10"/>
      <path d="M641 186 l9 -6 l10 -2" stroke-width="0.6" opacity="0.07"/>
      <path d="M284 342 l-11 7 l-4 10 l-12 5" stroke-width="0.7" opacity="0.09"/>
      <path d="M846 356 l10 6 l3 9" stroke-width="0.6" opacity="0.08"/>
      <path d="M150 158 l8 7 l9 3 l4 8" stroke-width="0.6" opacity="0.07"/>
    </g>

    <!-- small embedded pebbles: shadow, body, glint -->
    <g filter="url(#cm-peb-soft)">
      <!-- upper field -->
      <g transform="translate(112 88) rotate(14)">
        <ellipse cx="0.5" cy="1" rx="3.4" ry="2.5" fill="#5f5138" opacity="0.16"/>
        <ellipse rx="3.2" ry="2.3" fill="#c3b499"/>
        <ellipse cx="-0.9" cy="-0.7" rx="1.3" ry="0.8" fill="#f4ecd9" opacity="0.7"/>
      </g>
      <g transform="translate(438 61) rotate(-22)">
        <ellipse cx="0.4" cy="0.9" rx="2.6" ry="1.9" fill="#5f5138" opacity="0.15"/>
        <ellipse rx="2.4" ry="1.7" fill="#cfc1a5"/>
        <ellipse cx="-0.7" cy="-0.5" rx="1" ry="0.6" fill="#f6efdd" opacity="0.65"/>
      </g>
      <g transform="translate(742 96) rotate(31)">
        <ellipse cx="0.5" cy="1" rx="3.8" ry="2.7" fill="#5c4e36" opacity="0.16"/>
        <ellipse rx="3.6" ry="2.5" fill="#b8a98e"/>
        <ellipse cx="-1.1" cy="-0.8" rx="1.4" ry="0.9" fill="#f2e9d5" opacity="0.6"/>
      </g>
      <g transform="translate(317 156) rotate(-9)">
        <ellipse cx="0.3" cy="0.8" rx="2.1" ry="1.6" fill="#5f5138" opacity="0.14"/>
        <ellipse rx="2" ry="1.5" fill="#c9bb9f"/>
        <ellipse cx="-0.6" cy="-0.4" rx="0.8" ry="0.5" fill="#f5eedb" opacity="0.6"/>
      </g>
      <g transform="translate(596 178) rotate(40)">
        <ellipse cx="0.4" cy="0.9" rx="2.9" ry="2" fill="#5c4e36" opacity="0.15"/>
        <ellipse rx="2.7" ry="1.9" fill="#c0b195"/>
        <ellipse cx="-0.8" cy="-0.6" rx="1.1" ry="0.7" fill="#f4ecd8" opacity="0.6"/>
      </g>
      <g transform="translate(905 172) rotate(-16)">
        <ellipse cx="0.3" cy="0.8" rx="2.2" ry="1.6" fill="#5f5138" opacity="0.14"/>
        <ellipse rx="2.1" ry="1.5" fill="#cbbda1"/>
        <ellipse cx="-0.6" cy="-0.4" rx="0.8" ry="0.5" fill="#f6efdd" opacity="0.6"/>
      </g>
      <!-- middle field -->
      <g transform="translate(86 232) rotate(24)">
        <ellipse cx="0.4" cy="0.9" rx="2.8" ry="2" fill="#5c4e36" opacity="0.15"/>
        <ellipse rx="2.6" ry="1.9" fill="#bfae92"/>
        <ellipse cx="-0.8" cy="-0.6" rx="1" ry="0.6" fill="#f3ebd7" opacity="0.6"/>
      </g>
      <g transform="translate(369 258) rotate(-33)">
        <ellipse cx="0.5" cy="1" rx="3.5" ry="2.4" fill="#5c4e36" opacity="0.16"/>
        <ellipse rx="3.3" ry="2.2" fill="#c6b79b"/>
        <ellipse cx="-1" cy="-0.7" rx="1.3" ry="0.8" fill="#f5eedb" opacity="0.65"/>
      </g>
      <g transform="translate(474 150) rotate(8)">
        <ellipse cx="0.3" cy="0.7" rx="1.8" ry="1.4" fill="#5f5138" opacity="0.13"/>
        <ellipse rx="1.7" ry="1.3" fill="#cdbfa3"/>
        <ellipse cx="-0.5" cy="-0.4" rx="0.7" ry="0.4" fill="#f6efdd" opacity="0.55"/>
      </g>
      <g transform="translate(818 241) rotate(-27)">
        <ellipse cx="0.4" cy="0.9" rx="3" ry="2.1" fill="#5c4e36" opacity="0.15"/>
        <ellipse rx="2.8" ry="2" fill="#baab8f"/>
        <ellipse cx="-0.9" cy="-0.6" rx="1.1" ry="0.7" fill="#f2ead6" opacity="0.6"/>
      </g>
      <g transform="translate(660 262) rotate(19)">
        <ellipse cx="0.3" cy="0.8" rx="2.2" ry="1.6" fill="#5f5138" opacity="0.14"/>
        <ellipse rx="2.1" ry="1.5" fill="#c8b99d"/>
        <ellipse cx="-0.6" cy="-0.4" rx="0.8" ry="0.5" fill="#f5eedb" opacity="0.6"/>
      </g>
      <!-- lower field -->
      <g transform="translate(168 383) rotate(-12)">
        <ellipse cx="0.4" cy="0.9" rx="2.7" ry="1.9" fill="#5c4e36" opacity="0.15"/>
        <ellipse rx="2.5" ry="1.8" fill="#c2b297"/>
        <ellipse cx="-0.8" cy="-0.5" rx="1" ry="0.6" fill="#f4ecd8" opacity="0.6"/>
      </g>
      <g transform="translate(238 342) rotate(35)">
        <ellipse cx="0.3" cy="0.8" rx="2" ry="1.5" fill="#5f5138" opacity="0.14"/>
        <ellipse rx="1.9" ry="1.4" fill="#ccbea2"/>
        <ellipse cx="-0.6" cy="-0.4" rx="0.7" ry="0.5" fill="#f6efdd" opacity="0.55"/>
      </g>
      <g transform="translate(521 299) rotate(-20)">
        <ellipse cx="0.5" cy="1" rx="3.6" ry="2.5" fill="#5c4e36" opacity="0.16"/>
        <ellipse rx="3.4" ry="2.3" fill="#bcac90"/>
        <ellipse cx="-1" cy="-0.7" rx="1.3" ry="0.8" fill="#f3ebd7" opacity="0.6"/>
      </g>
      <g transform="translate(688 353) rotate(11)">
        <ellipse cx="0.4" cy="0.9" rx="2.5" ry="1.8" fill="#5f5138" opacity="0.14"/>
        <ellipse rx="2.3" ry="1.7" fill="#c7b89c"/>
        <ellipse cx="-0.7" cy="-0.5" rx="0.9" ry="0.6" fill="#f5eedb" opacity="0.6"/>
      </g>
      <g transform="translate(905 332) rotate(-30)">
        <ellipse cx="0.4" cy="0.9" rx="2.9" ry="2" fill="#5c4e36" opacity="0.15"/>
        <ellipse rx="2.7" ry="1.9" fill="#beae92"/>
        <ellipse cx="-0.8" cy="-0.6" rx="1.1" ry="0.7" fill="#f2ead6" opacity="0.6"/>
      </g>
      <g transform="translate(56 148) rotate(6)">
        <ellipse cx="0.3" cy="0.7" rx="1.7" ry="1.3" fill="#5f5138" opacity="0.13"/>
        <ellipse rx="1.6" ry="1.2" fill="#cdbfa3"/>
        <ellipse cx="-0.5" cy="-0.3" rx="0.6" ry="0.4" fill="#f6efdd" opacity="0.55"/>
      </g>
      <g transform="translate(960 68) rotate(-18)">
        <ellipse cx="0.3" cy="0.8" rx="2.1" ry="1.5" fill="#5f5138" opacity="0.14"/>
        <ellipse rx="2" ry="1.4" fill="#c5b69a"/>
        <ellipse cx="-0.6" cy="-0.4" rx="0.8" ry="0.5" fill="#f5eedb" opacity="0.55"/>
      </g>
    </g>

    <!-- coarser dark grains and rare glints over everything -->
    <rect x="0" y="0" width="1000" height="420" filter="url(#cm-grit-dark)"/>
    <rect x="0" y="0" width="1000" height="420" filter="url(#cm-grit-glint)"/>

    <!-- recession haze + near-edge deepening -->
    <rect x="0" y="0" width="1000" height="420" fill="url(#cm-recede-grad)"/>

    <!-- gentle vignette so placed stones feel seated -->
    <rect x="0" y="0" width="1000" height="420" fill="url(#cm-vignette-grad)"/>
  </g>
</defs>`;

// Moss overlays — laid over the crown and shaded flank of a dormant stone.
// cm-moss.js — six hand-drawn moss overlays for boulder crowns.
// Anime painted-map style: dark ink outlines, flat hard-edged shading, sun upper-left.
const K = '#262e1b';                                    // ink
const cD = '#3d5232', cM = '#567147', cL = '#7b955a', cS = '#2c3d24'; // cool set
const wD = '#4a5a2d', wM = '#68803f', wL = '#90a253', wS = '#37451f'; // warm set
const OUT = `stroke="${K}" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"`;
const fl = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${K}" stroke-width="1"/>`;

// 1 — heavy blanket over the crown, thick drip down the left flank (cool)
const MOSS_S1 = `<symbol id="cm-moss-1" viewBox="0 0 100 100">
<path ${OUT} fill="${cD}" d="M6,80 Q3,74 6,69 Q2,63 7,58 Q3,51 8,46 Q4,39 10,34 Q6,26 14,24 Q13,16 22,16 Q25,9 34,11 Q39,5 47,9 Q54,4 61,9 Q69,6 74,12 Q83,11 86,18 Q93,20 92,27 Q97,32 92,37 Q90,44 83,41 Q82,48 75,45 Q73,52 67,47 Q64,42 58,45 Q56,52 50,48 Q46,54 42,49 Q40,44 35,46 Q36,54 31,56 Q33,64 27,66 Q29,73 23,74 Q25,81 19,82 Q14,86 10,82 Q5,85 6,80 Z"/>
<path fill="${cM}" d="M9,45 Q5,38 11,33 Q8,25 17,23 Q19,15 28,16 Q33,9 42,13 Q50,8 57,13 Q66,10 71,16 Q80,15 82,22 Q88,26 84,31 Q86,37 79,35 Q74,40 68,36 Q62,41 56,37 Q50,42 44,38 Q38,42 33,38 Q26,43 21,38 Q14,43 9,45 Z"/>
<path fill="${cM}" d="M27,52 Q33,52 31,58 Q34,64 27,66 Q29,72 22,72 Q16,74 16,67 Q13,61 19,58 Q17,52 23,52 Q25,50 27,52 Z"/>
<path fill="${cL}" d="M15,29 Q13,21 22,20 Q26,13 35,15 Q41,10 48,14 Q44,20 37,20 Q30,21 27,25 Q21,26 19,31 Q15,33 15,29 Z"/>
<path fill="${cL}" d="M55,15 Q63,11 68,17 Q63,21 57,20 Q53,19 55,15 Z"/>
<path fill="${cL}" d="M20,57 Q26,55 26,61 Q23,65 18,62 Q17,58 20,57 Z"/>
<path fill="${cS}" d="M70,38 Q77,41 83,37 Q86,41 80,43 Q74,47 69,43 Q67,40 70,38 Z"/>
<path fill="${cS}" d="M24,70 Q28,68 27,73 Q24,77 20,74 Q21,70 24,70 Z"/>
${fl(41, 54, 1.5, cD)}${fl(50, 52, 1.1, cD)}${fl(13, 88, 1.6, cD)}${fl(88, 42, 1.3, cD)}${fl(63, 51, 1.1, cD)}
</symbol>`;

// 2 — thin patchy scatter along the crown, small clumps trailing down the right (warm)
const MOSS_S2 = `<symbol id="cm-moss-2" viewBox="0 0 100 100">
<path ${OUT} fill="${wD}" d="M13,31 Q10,25 16,22 Q19,15 27,17 Q34,14 37,20 Q41,25 35,28 Q30,33 24,30 Q17,34 13,31 Z"/>
<path fill="${wM}" d="M16,27 Q15,21 22,20 Q29,17 33,22 Q35,26 30,27 Q23,30 16,27 Z"/>
<path fill="${wL}" d="M18,23 Q22,18 28,20 Q26,24 21,25 Q17,26 18,23 Z"/>
<path ${OUT} fill="${wD}" d="M43,21 Q41,15 48,13 Q54,9 59,15 Q64,18 59,23 Q53,27 47,24 Q42,25 43,21 Z"/>
<path fill="${wL}" d="M47,16 Q52,12 56,16 Q52,19 48,18 Q46,17 47,16 Z"/>
<path ${OUT} fill="${wD}" d="M66,28 Q64,22 70,20 Q76,17 80,22 Q84,26 78,29 Q71,33 66,28 Z"/>
<path fill="${wL}" d="M70,23 Q74,20 77,24 Q73,26 70,23 Z"/>
<path ${OUT} fill="${wD}" d="M72,47 Q70,41 76,39 Q82,36 86,42 Q88,47 82,49 Q75,52 72,47 Z"/>
<path fill="${wL}" d="M75,43 Q79,40 82,44 Q78,46 75,43 Z"/>
<path ${OUT} fill="${wD}" d="M79,64 Q78,58 84,58 Q89,58 89,63 Q88,67 83,67 Q79,68 79,64 Z"/>
<path fill="${wL}" d="M82,61 Q85,59 86,62 Q83,64 82,61 Z"/>
<path ${OUT} fill="${wD}" d="M57,35 Q57,30 62,30 Q66,31 65,35 Q61,38 57,35 Z"/>
<path ${OUT} fill="${wD}" d="M84,76 Q84,72 88,72 Q91,73 90,77 Q86,79 84,76 Z"/>
${fl(38, 31, 1.3, wD)}${fl(63, 26, 1.1, wD)}${fl(84, 33, 1.4, wD)}${fl(70, 56, 1.2, wD)}${fl(92, 55, 1.1, wD)}${fl(78, 71, 1.3, wD)}${fl(30, 36, 1.1, wD)}
</symbol>`;

// 3 — twin cushions on the crown, one tongue creeping down the right flank (cool)
const MOSS_S3 = `<symbol id="cm-moss-3" viewBox="0 0 100 100">
<path ${OUT} fill="${cD}" d="M10,40 Q5,33 11,29 Q9,21 18,20 Q22,12 31,14 Q38,9 45,14 Q52,13 52,21 Q57,26 51,31 Q52,38 44,37 Q40,43 33,40 Q27,45 21,40 Q14,44 10,40 Z"/>
<path fill="${cM}" d="M13,36 Q9,29 15,26 Q14,19 23,19 Q28,13 36,17 Q43,14 45,21 Q49,25 44,29 Q37,27 33,31 Q26,28 22,32 Q15,31 13,36 Z"/>
<path fill="${cL}" d="M16,26 Q17,19 25,19 Q30,14 37,17 Q33,22 27,22 Q20,24 19,29 Q15,30 16,26 Z"/>
<path fill="${cS}" d="M32,37 Q39,40 44,36 Q45,41 38,42 Q32,42 30,39 Q30,37 32,37 Z"/>
<path ${OUT} fill="${cD}" d="M50,35 Q45,29 50,25 Q49,16 59,17 Q64,10 72,14 Q80,12 83,19 Q90,22 87,29 Q90,36 82,36 Q84,43 78,45 Q81,51 75,53 Q78,60 72,61 Q75,68 68,69 Q71,77 63,76 Q58,79 57,72 Q60,67 60,62 Q56,58 61,54 Q57,50 62,46 Q57,43 60,39 Q54,41 51,38 Q46,39 50,35 Z"/>
<path fill="${cM}" d="M52,31 Q49,24 55,22 Q56,15 64,17 Q70,12 76,17 Q82,17 83,23 Q87,27 83,30 Q77,33 71,30 Q64,34 58,30 Q51,34 52,31 Z"/>
<path fill="${cM}" d="M64,45 Q69,43 70,48 Q74,52 70,55 Q73,61 67,62 Q69,68 64,67 Q60,68 61,62 Q63,58 62,54 Q59,49 64,45 Z"/>
<path fill="${cL}" d="M55,20 Q60,14 67,17 Q73,14 77,19 Q71,22 65,20 Q59,22 56,24 Q52,23 55,20 Z"/>
<path fill="${cL}" d="M64,49 Q68,47 68,52 Q65,55 62,52 Q62,49 64,49 Z"/>
<path fill="${cS}" d="M72,56 Q76,54 75,60 Q72,66 68,66 Q71,61 70,58 Q71,55 72,56 Z"/>
${fl(47, 44, 1.4, cD)}${fl(56, 46, 1.1, cD)}${fl(66, 81, 1.5, cD)}${fl(88, 40, 1.2, cD)}${fl(6, 38, 1.2, cD)}${fl(12, 47, 1.1, cD)}
</symbol>`;

// 4 — heavy drape: dense crown mass pouring down the right flank in three hanging fingers (warm)
const MOSS_S4 = `<symbol id="cm-moss-4" viewBox="0 0 100 100">
<path ${OUT} fill="${wD}" d="M28,38 Q23,36 24,30 Q20,24 28,22 Q30,14 39,15 Q44,9 52,12 Q60,7 67,12 Q75,10 79,16 Q87,16 89,23 Q95,26 93,33 Q97,40 92,45 Q96,53 91,58 Q95,66 90,72 Q94,80 90,84 Q92,90 85,88 Q79,90 81,83 Q78,77 82,71 Q79,66 81,61 Q77,58 74,62 Q76,68 72,71 Q74,77 68,74 Q63,76 66,69 Q63,64 67,60 Q63,56 59,58 Q60,53 56,55 Q58,60 53,61 Q48,62 51,56 Q48,51 52,48 Q47,45 43,47 Q40,43 36,45 Q31,44 32,40 Q28,42 28,38 Z"/>
<path fill="${wM}" d="M28,34 Q25,28 30,25 Q31,17 41,18 Q46,12 54,15 Q62,10 68,15 Q76,13 79,19 Q86,20 87,26 Q91,30 88,34 Q92,41 87,45 Q91,52 86,56 Q89,63 85,66 Q80,69 79,63 Q82,57 78,53 Q80,47 75,44 Q70,47 66,43 Q59,46 54,42 Q47,45 43,41 Q36,44 33,40 Q28,40 28,34 Z"/>
<path fill="${wL}" d="M33,26 Q34,18 43,19 Q48,14 55,17 Q51,22 44,22 Q38,23 37,28 Q33,30 33,26 Z"/>
<path fill="${wL}" d="M60,16 Q67,12 72,17 Q67,20 62,19 Q58,19 60,16 Z"/>
<path fill="${wL}" d="M84,38 Q88,36 89,41 Q87,46 83,44 Q81,40 84,38 Z"/>
<path fill="${wS}" d="M36,40 Q42,43 47,40 Q49,44 43,46 Q37,46 34,43 Q33,40 36,40 Z"/>
<path fill="${wS}" d="M84,72 Q87,70 87,76 Q86,82 82,81 Q83,76 84,72 Z"/>
${fl(24, 44, 1.3, wD)}${fl(47, 54, 1.2, wD)}${fl(62, 66, 1.1, wD)}${fl(93, 89, 1.5, wD)}${fl(75, 84, 1.2, wD)}
</symbol>`;

// 5 — sparse: one cushion up top with a small companion, thin trail down the left flank (cool)
const MOSS_S5 = `<symbol id="cm-moss-5" viewBox="0 0 100 100">
<path ${OUT} fill="${cD}" d="M14,34 Q10,28 15,24 Q14,16 23,16 Q27,10 35,14 Q42,12 44,19 Q49,23 44,27 Q45,33 37,32 Q31,37 25,33 Q18,37 14,34 Z"/>
<path fill="${cM}" d="M17,29 Q14,23 20,20 Q21,14 29,15 Q36,13 39,19 Q43,23 38,26 Q31,29 26,26 Q20,30 17,29 Z"/>
<path fill="${cL}" d="M19,22 Q21,15 29,16 Q34,12 38,17 Q33,20 28,19 Q22,20 22,25 Q18,26 19,22 Z"/>
<path fill="${cS}" d="M27,31 Q33,33 38,30 Q39,34 33,35 Q27,35 25,33 Q25,31 27,31 Z"/>
<path ${OUT} fill="${cD}" d="M52,24 Q50,18 56,16 Q62,13 66,18 Q70,22 64,25 Q57,28 52,24 Z"/>
<path fill="${cL}" d="M56,19 Q60,15 63,19 Q59,22 56,19 Z"/>
<path ${OUT} fill="${cD}" d="M16,45 Q14,40 20,39 Q26,38 27,43 Q26,48 20,48 Q15,49 16,45 Z"/>
<path fill="${cL}" d="M19,42 Q23,40 24,44 Q20,46 19,42 Z"/>
<path ${OUT} fill="${cD}" d="M10,58 Q9,53 15,53 Q20,53 19,58 Q17,62 12,61 Q9,61 10,58 Z"/>
<path fill="${cL}" d="M13,55 Q16,54 16,57 Q13,59 12,57 Q12,55 13,55 Z"/>
<path ${OUT} fill="${cD}" d="M17,70 Q16,66 21,66 Q25,67 24,71 Q20,74 17,70 Z"/>
<path ${OUT} fill="${cD}" d="M11,80 Q11,77 15,77 Q18,78 16,81 Q12,83 11,80 Z"/>
${fl(34, 38, 1.3, cD)}${fl(48, 28, 1.1, cD)}${fl(70, 27, 1.2, cD)}${fl(28, 52, 1.2, cD)}${fl(7, 68, 1.1, cD)}${fl(20, 87, 1.3, cD)}
</symbol>`;

// 6 — ragged band across the whole crown, heavier creep down the left, short lick down the right (warm)
const MOSS_S6 = `<symbol id="cm-moss-6" viewBox="0 0 100 100">
<path ${OUT} fill="${wD}" d="M12,70 Q7,71 8,65 Q4,60 8,56 Q4,49 8,45 Q4,38 9,33 Q6,25 14,24 Q16,16 25,17 Q30,10 38,13 Q45,8 52,12 Q59,7 66,12 Q73,9 78,15 Q86,14 89,21 Q94,24 92,31 Q96,37 90,40 Q93,46 88,49 Q90,54 84,53 Q80,55 81,49 Q83,44 78,42 Q73,46 68,42 Q63,47 57,43 Q51,48 46,44 Q40,48 35,45 Q36,51 31,53 Q33,59 27,61 Q29,67 22,67 Q24,73 17,72 Q13,75 12,70 Z"/>
<path fill="${wM}" d="M11,44 Q7,37 12,33 Q10,26 18,25 Q21,18 29,19 Q34,13 41,16 Q48,11 55,15 Q62,11 68,16 Q75,14 79,20 Q85,21 87,27 Q90,31 86,34 Q88,39 82,37 Q76,41 71,37 Q65,42 59,38 Q53,43 48,39 Q42,43 37,40 Q30,44 26,40 Q18,45 15,41 Q11,46 11,44 Z"/>
<path fill="${wM}" d="M18,52 Q24,51 23,57 Q25,62 20,63 Q22,68 16,67 Q12,68 14,62 Q12,56 16,54 Z"/>
<path fill="${wL}" d="M14,29 Q16,21 25,21 Q30,15 38,17 Q34,22 27,23 Q20,24 19,30 Q14,33 14,29 Z"/>
<path fill="${wL}" d="M46,15 Q53,11 59,16 Q54,19 48,18 Q44,18 46,15 Z"/>
<path fill="${wL}" d="M68,18 Q74,15 77,20 Q72,22 68,21 Q66,20 68,18 Z"/>
<path fill="${wL}" d="M17,56 Q21,54 21,59 Q18,61 15,59 Q15,56 17,56 Z"/>
<path fill="${wS}" d="M80,43 Q84,41 84,47 Q82,51 78,49 Q79,45 80,43 Z"/>
<path fill="${wS}" d="M60,40 Q66,42 71,39 Q72,43 66,45 Q60,45 58,42 Q58,40 60,40 Z"/>
${fl(33, 50, 1.3, wD)}${fl(44, 49, 1.1, wD)}${fl(9, 76, 1.4, wD)}${fl(89, 57, 1.2, wD)}${fl(54, 48, 1.1, wD)}
</symbol>`;

export const CM_MOSS_DEFS = '<defs>' + MOSS_S1 + MOSS_S2 + MOSS_S3 + MOSS_S4 + MOSS_S5 + MOSS_S6 + '</defs>';

// Flat moss mats — colonies seeded in the grout joints of a tiled panel,
// spread across the flat faces. Top-down; no domed cushion silhouette.
// cm-mossmat.js — six hand-drawn moss overlays for a FLAT tiled stone floor, seen top-down.
// Anime painted-map style: dark ink outlines, flat hard-edged shading, no domed/boulder forms.
// Moss is imagined seeded at the tile's grout edges and creeping inward in ragged colonies —
// composition (not color) carries the top-down "flat mat" read: growth hugs the square's
// edges/corners, center stays open in places so the tile face still shows through.
const MAT_K = '#1f2615';                                                     // ink
const MAT_dA = '#3c4d27', MAT_mA = '#5b7238', MAT_lA = '#82974f', MAT_sA = '#28331a';    // cool set (older growth)
const MAT_dB = '#4b5a2c', MAT_mB = '#6d804a', MAT_lB = '#98a965', MAT_sB = '#37401f';    // warm set (younger growth)
const MAT_OUT = `stroke="${MAT_K}" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"`;
const MAT_fl = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${MAT_K}" stroke-width="0.8"/>`;

// 1 — sparse scatter: a couple of tiny nubs at the edges, two colonies adrift mid-tile, lots of open tile
const S1 = `<symbol id="cm-mossmat-1" viewBox="0 0 100 100">
<path ${MAT_OUT} fill="${MAT_dA}" d="M5,0 Q3,5 7,6 Q6,11 11,10 Q10,15 15,12 Q19,16 20,10 Q24,12 22,6 Q26,4 21,2 Q18,0 14,1 Q10,0 5,0 Z"/>
<path fill="${MAT_mA}" d="M9,2 Q8,6 11,7 Q10,10 14,9 Q17,11 16,7 Q19,6 15,4 Q12,3 9,2 Z"/>
<path fill="${MAT_lA}" d="M11,4 Q14,3 13,6 Q10,7 9,5 Q9,4 11,4 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M0,55 Q5,53 6,58 Q11,58 9,63 Q13,65 9,69 Q11,74 6,72 Q4,77 1,73 Q3,68 0,65 Q2,60 0,55 Z"/>
<path fill="${MAT_mA}" d="M2,57 Q6,56 6,60 Q10,60 8,64 Q5,66 3,63 Q2,60 2,57 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M55,63 Q61,64 60,69 Q66,70 63,75 Q66,80 60,81 Q59,86 54,83 Q49,85 49,79 Q44,77 48,73 Q46,68 52,67 Q52,63 55,63 Z"/>
<path fill="${MAT_mA}" d="M53,66 Q58,67 57,71 Q61,73 58,77 Q54,78 52,75 Q49,72 51,69 Q52,67 53,66 Z"/>
<path fill="${MAT_lA}" d="M51,65 Q55,64 54,68 Q50,69 49,66 Q50,65 51,65 Z"/>
<path fill="${MAT_sA}" d="M58,76 Q62,75 61,79 Q57,80 56,77 Q57,76 58,76 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M78,25 Q82,26 81,30 Q84,33 80,35 Q78,38 75,35 Q72,33 75,30 Q74,27 78,25 Z"/>
<path fill="${MAT_lA}" d="M77,27 Q80,26 79,29 Q76,30 76,28 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M40,42 Q43,43 42,46 Q40,48 38,46 Q37,44 40,42 Z"/>
${MAT_fl(45, 15, 1.1, MAT_dA)}${MAT_fl(65, 60, 1, MAT_dA)}${MAT_fl(30, 20, 1.2, MAT_dA)}${MAT_fl(85, 75, 1, MAT_dA)}${MAT_fl(20, 85, 1.3, MAT_dA)}${MAT_fl(60, 25, 0.9, MAT_dA)}${MAT_fl(90, 50, 1.1, MAT_dA)}${MAT_fl(38, 68, 0.9, MAT_dA)}${MAT_fl(70, 10, 1, MAT_dA)}${MAT_fl(15, 45, 0.9, MAT_dA)}
</symbol>`;

// 2 — light growth along the bottom edge, ragged fingers reaching up, one satellite adrift top-right
const S2 = `<symbol id="cm-mossmat-2" viewBox="0 0 100 100">
<path ${MAT_OUT} fill="${MAT_dB}" d="M8,100 Q6,92 11,90 Q9,82 15,84 Q13,74 19,77 Q17,66 23,70 Q21,58 27,63 Q30,70 34,67 Q32,78 38,75 Q36,86 42,83 Q40,94 46,90 Q48,96 50,100 Z"/>
<path fill="${MAT_mB}" d="M14,100 Q13,90 18,89 Q17,80 21,82 Q20,71 25,74 Q28,66 31,71 Q30,79 35,77 Q33,88 39,85 Q38,95 43,92 Q44,98 44,100 Z"/>
<path fill="${MAT_lB}" d="M18,64 Q22,62 24,67 Q21,71 17,69 Q16,66 18,64 Z"/>
<path fill="${MAT_sB}" d="M34,90 Q39,88 38,94 Q34,96 32,92 Q32,90 34,90 Z"/>
<path ${MAT_OUT} fill="${MAT_dB}" d="M28,52 Q31,48 33,53 Q31,57 27,55 Q26,53 28,52 Z"/>
<path ${MAT_OUT} fill="${MAT_dB}" d="M46,58 Q49,55 50,60 Q47,63 44,60 Q44,58 46,58 Z"/>
<path ${MAT_OUT} fill="${MAT_dB}" d="M78,17 Q83,18 82,23 Q85,26 80,28 Q78,32 74,29 Q71,26 74,23 Q73,19 78,17 Z"/>
<path fill="${MAT_mB}" d="M77,20 Q81,20 80,24 Q78,26 76,24 Q75,21 77,20 Z"/>
<path fill="${MAT_lB}" d="M76,19 Q79,18 78,21 Q75,21 76,19 Z"/>
${MAT_fl(60, 30, 1.1, MAT_dB)}${MAT_fl(90, 40, 1, MAT_dB)}${MAT_fl(66, 88, 1.2, MAT_dB)}${MAT_fl(20, 40, 0.9, MAT_dB)}${MAT_fl(52, 45, 1, MAT_dB)}${MAT_fl(84, 60, 1.1, MAT_dB)}${MAT_fl(10, 65, 0.9, MAT_dB)}
</symbol>`;

// 3 — corner growth: left + top edges meet at top-left, a broken tendril and fleck reach toward center
const S3 = `<symbol id="cm-mossmat-3" viewBox="0 0 100 100">
<path ${MAT_OUT} fill="${MAT_dA}" d="M0,0 Q3,6 8,5 Q6,13 12,11 Q10,19 16,15 Q20,22 24,17 Q19,10 27,12 Q30,6 35,0 Z"/>
<path fill="${MAT_mA}" d="M2,2 Q6,7 10,6 Q9,13 14,11 Q13,18 19,15 Q15,10 22,11 Q25,6 28,3 Q13,1 2,2 Z"/>
<path fill="${MAT_lA}" d="M4,4 Q9,4 8,9 Q4,10 3,7 Q3,5 4,4 Z"/>
<path fill="${MAT_sA}" d="M18,14 Q23,12 22,18 Q17,20 15,16 Q16,15 18,14 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M0,3 Q6,4 5,10 Q11,9 9,15 Q16,16 13,22 Q19,21 14,28 Q9,25 10,32 Q4,29 5,36 Q0,34 0,3 Z"/>
<path fill="${MAT_mA}" d="M0,6 Q5,7 4,12 Q9,12 7,17 Q12,18 9,23 Q6,21 6,26 Q1,24 2,29 Q0,27 0,6 Z"/>
<path fill="${MAT_lA}" d="M2,8 Q6,9 5,13 Q1,13 1,10 Q1,8 2,8 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M28,27 Q32,25 33,30 Q30,34 26,31 Q25,28 28,27 Z"/>
<path ${MAT_OUT} fill="${MAT_dA}" d="M43,12 Q47,11 47,15 Q44,18 41,15 Q41,13 43,12 Z"/>
${MAT_fl(38, 30, 1.1, MAT_dA)}${MAT_fl(50, 25, 0.9, MAT_dA)}${MAT_fl(60, 12, 1.1, MAT_dA)}${MAT_fl(22, 35, 1, MAT_dA)}${MAT_fl(10, 44, 0.9, MAT_dA)}${MAT_fl(70, 30, 1, MAT_dA)}${MAT_fl(45, 45, 0.9, MAT_dA)}
</symbol>`;

// 4 — heavy bottom-right corner mat, satellites pulling away toward the opposite corner
const S4 = `<symbol id="cm-mossmat-4" viewBox="0 0 100 100">
<path ${MAT_OUT} fill="${MAT_dB}" d="M55,100 Q50,90 58,87 Q54,78 63,80 Q58,70 68,73 Q72,64 78,70 Q84,64 88,72 Q94,66 96,74 Q100,70 100,60 L100,100 Z"/>
<path fill="${MAT_mB}" d="M60,98 Q56,90 62,88 Q59,80 66,82 Q62,73 70,76 Q74,68 79,73 Q85,68 88,75 Q93,71 94,77 Q97,74 98,68 L98,98 Z"/>
<path fill="${MAT_lB}" d="M64,76 Q69,73 71,78 Q67,82 62,79 Q61,77 64,76 Z"/>
<path fill="${MAT_lB}" d="M84,73 Q89,71 90,76 Q86,79 82,76 Q82,74 84,73 Z"/>
<path fill="${MAT_sB}" d="M60,92 Q65,90 64,96 Q59,98 57,94 Q58,92 60,92 Z"/>
<path ${MAT_OUT} fill="${MAT_dB}" d="M60,29 Q65,30 64,35 Q68,38 63,40 Q61,44 57,41 Q54,38 57,35 Q56,31 60,29 Z"/>
<path fill="${MAT_mB}" d="M59,32 Q63,32 62,36 Q59,38 57,36 Q57,33 59,32 Z"/>
<path fill="${MAT_lB}" d="M59,31 Q62,31 61,33 Q58,33 59,31 Z"/>
<path ${MAT_OUT} fill="${MAT_dB}" d="M35,46 Q39,47 38,51 Q41,54 37,55 Q34,57 32,54 Q31,51 33,49 Q33,47 35,46 Z"/>
<path fill="${MAT_lB}" d="M35,48 Q38,48 37,51 Q34,51 34,49 Z"/>
<path ${MAT_OUT} fill="${MAT_dB}" d="M18,20 Q21,20 20,23 Q18,25 16,23 Q16,21 18,20 Z"/>
${MAT_fl(46, 40, 1.1, MAT_dB)}${MAT_fl(28, 30, 0.9, MAT_dB)}${MAT_fl(72, 45, 1, MAT_dB)}${MAT_fl(50, 60, 0.9, MAT_dB)}${MAT_fl(8, 12, 1, MAT_dB)}${MAT_fl(90, 90, 1.2, MAT_dB)}
</symbol>`;

// 5 — dense mat reaching most edges but punched with a few holes so tile still reads through
const S5 = `<symbol id="cm-mossmat-5" viewBox="0 0 100 100">
<path ${MAT_OUT} fill="${MAT_dA}" fill-rule="evenodd" d="M18,0 Q28,7 38,10 Q46,3 55,0 Q68,2 78,8 Q92,13 100,22 Q92,32 88,42 Q96,50 100,58 Q90,68 82,78 Q76,90 66,100 Q54,92 45,88 Q36,96 28,100 Q16,90 8,80 Q2,66 0,55 Q8,42 14,30 Q10,14 18,0 Z
M45,37 Q52,38 51,45 Q54,52 47,53 Q45,58 39,54 Q35,50 39,45 Q38,40 45,37 Z
M68,55 Q73,56 72,61 Q75,65 70,66 Q66,68 64,64 Q62,60 65,57 Q66,55 68,55 Z
M30,64 Q34,65 33,69 Q35,72 31,73 Q28,74 27,71 Q26,68 28,66 Q29,64 30,64 Z"/>
<path fill="${MAT_mA}" d="M25,10 Q40,14 52,8 Q66,12 78,18 Q88,28 84,40 Q90,50 82,60 Q76,74 64,80 Q52,90 40,82 Q28,86 22,74 Q14,64 18,52 Q10,42 16,32 Q14,18 25,10 Z"/>
<path fill="${MAT_lA}" d="M24,12 Q30,10 30,16 Q26,20 21,17 Q20,13 24,12 Z"/>
<path fill="${MAT_sA}" d="M72,80 Q78,78 78,84 Q73,88 69,84 Q69,81 72,80 Z"/>
${MAT_fl(50, 25, 1.2, MAT_dA)}${MAT_fl(60, 40, 1, MAT_dA)}${MAT_fl(35, 60, 1, MAT_dA)}${MAT_fl(70, 30, 0.9, MAT_dA)}${MAT_fl(15, 45, 1, MAT_dA)}${MAT_fl(55, 75, 0.9, MAT_dA)}${MAT_fl(88, 55, 1.1, MAT_dA)}${MAT_fl(40, 95, 0.9, MAT_dA)}
</symbol>`;

// 6 — densest of the six: old growth spans nearly the whole tile, only two small ragged gaps left open
const S6 = `<symbol id="cm-mossmat-6" viewBox="0 0 100 100">
<path ${MAT_OUT} fill="${MAT_dB}" fill-rule="evenodd" d="M10,0 Q22,4 30,6 Q40,2 48,0 Q60,4 70,5 Q82,1 90,0 Q98,8 100,18 Q95,28 94,38 Q99,46 100,55 Q94,64 90,74 Q98,82 100,90 Q88,96 78,100 Q68,94 58,92 Q49,98 40,100 Q30,94 20,90 Q8,86 0,78 Q6,68 8,58 Q2,48 0,38 Q4,28 6,18 Q6,8 10,0 Z
M55,46 Q59,47 58,51 Q61,54 57,55 Q54,57 52,54 Q50,51 52,48 Q53,46 55,46 Z
M25,52 Q28,53 27,56 Q29,59 26,59 Q23,60 22,57 Q21,54 23,53 Q24,52 25,52 Z"/>
<path fill="${MAT_mB}" d="M18,10 Q40,14 55,8 Q72,12 86,10 Q94,24 90,40 Q96,52 90,64 Q94,80 82,88 Q68,94 52,90 Q38,96 24,88 Q10,80 12,64 Q6,50 12,36 Q8,20 18,10 Z"/>
<path fill="${MAT_lB}" d="M22,14 Q28,12 28,18 Q23,22 18,19 Q17,15 22,14 Z"/>
<path fill="${MAT_lB}" d="M50,10 Q56,8 56,13 Q51,16 46,14 Q46,11 50,10 Z"/>
<path fill="${MAT_sB}" d="M84,60 Q90,58 89,65 Q83,68 80,63 Q81,61 84,60 Z"/>
<path fill="${MAT_sB}" d="M60,86 Q66,84 66,90 Q60,93 56,89 Q56,87 60,86 Z"/>
${MAT_fl(55, 60, 1.1, MAT_dB)}${MAT_fl(25, 65, 1, MAT_dB)}${MAT_fl(40, 30, 0.9, MAT_dB)}${MAT_fl(70, 35, 1, MAT_dB)}${MAT_fl(35, 78, 0.9, MAT_dB)}${MAT_fl(78, 24, 1, MAT_dB)}${MAT_fl(15, 40, 0.9, MAT_dB)}${MAT_fl(64, 74, 1, MAT_dB)}${MAT_fl(90, 46, 0.9, MAT_dB)}${MAT_fl(45, 52, 1, MAT_dB)}
</symbol>`;

export const CM_MOSSMAT_DEFS = '<defs>' + S1 + S2 + S3 + S4 + S5 + S6 + '</defs>';
