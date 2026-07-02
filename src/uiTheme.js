/* Shared visual constants for the Edokai twilight design system.
   WORLD_HUES was searched + validated with the dataviz palette validator
   against the atlas sky surface (#0B102A): all 8 hues sit in the dark
   lightness band, clear 3:1 contrast, and the worst ALL-PAIRS colour-vision
   deficiency ΔE is 14.3 (target ≥ 12) — safe even without the direct labels
   every graph node also carries. Worlds beyond the 8th fold into slate. */
export const WORLD_HUES = [
  "#6885F6", // periwinkle
  "#00AE7F", // jade
  "#D05FAF", // magenta
  "#B38D00", // gold
  "#BB565A", // brick
  "#A269C9", // amethyst
  "#B16389", // mauve
  "#788A37", // moss
];
export const HUE_FOLD = "#64748B"; // 9th+ world: fold to neutral slate

export const hueFor = (i) => (i < WORLD_HUES.length ? WORLD_HUES[i] : HUE_FOLD);

const hexRgb = (hex) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
export const withAlpha = (hex, a) => {
  if (!hex || hex[0] !== "#") return hex;
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export const tint = (hex, amt) => {
  if (!hex || hex[0] !== "#") return hex;
  const [r, g, b] = hexRgb(hex);
  const m = (c) => Math.round(c + (255 - c) * amt);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
};
export const shade = (hex, amt) => {
  if (!hex || hex[0] !== "#") return hex;
  const [r, g, b] = hexRgb(hex);
  const m = (c) => Math.round(c * (1 - amt));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
};

/* Deterministic starfield: returns a box-shadow string of n stars inside w×h. */
export const starShadows = (n, w, h, seed = 7) => {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const size = rnd() > 0.85 ? 1.6 : 1;
    const a = 0.25 + rnd() * 0.6;
    out.push(`${Math.round(rnd() * w)}px ${Math.round(rnd() * h)}px 0 ${size / 2}px rgba(214,226,255,${a.toFixed(2)})`);
  }
  return out.join(",");
};
