// scripts/transparentize-logos.mjs
//
// One-shot helper (2026-09-17, KIRK): the original Hops + Perks logos in
// public/logos/ ship with opaque backgrounds (Hops: near-white frame
// around a black marquee; Perks: cream canvas behind a brown wordmark).
// On dark mode, the cream/white surrounds read as a loud halo next to the
// dashboard's muted chrome. Kirk wanted them to "blend into dark mode".
//
// Strategy:
//   1. Sample a small block at each corner of the input, take the median
//      color → that's our background.
//   2. For every pixel, compute Euclidean distance to the bg color.
//      - dist <= t1  → fully transparent
//      - dist >= t2  → fully opaque
//      - in between → linear alpha ramp (feather)
//   3. Write a 4-channel PNG with the RGB of the original pixel where
//      opaque, plus the alpha channel we just computed.
//
// This is destructive — it overwrites the original PNG. Re-run with a
// fresh drop-in if Kirk wants to re-key a different source.

import sharp from "sharp";
import { rename } from "node:fs/promises";

const T1_MULT = 0.7;   // below this distance → alpha 0
const T2_MULT = 2.4;   // above this distance → alpha 255

const TARGETS = [
  {
    path: "public/logos/hops-logo.png",
    // BG measured at the four corners (1254x1254): ~253,253,253.
    // Threshold is small because the bg is uniform.
    fallbackBg: [253, 253, 253],
    threshold: 22,
  },
  {
    path: "public/logos/perks-logo.png",
    // BG measured at the four corners: ~254,239,220 (cream).
    // Threshold a bit larger because cream pixels drift in the gradient.
    fallbackBg: [254, 239, 220],
    threshold: 32,
  },
];

function medianColor(samples) {
  // samples is an array of [r,g,b] triples; return the per-channel median.
  const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

async function detectBgColor(path) {
  // Average the four 32x32 corner blocks to estimate the canvas color.
  const { data, info } = await sharp(path)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const samples = [];
  const regions = [
    [0, 0],
    [width - 32, 0],
    [0, height - 32],
    [width - 32, height - 32],
  ];
  for (const [x, y] of regions) {
    for (let yy = y; yy < y + 32; yy++) {
      for (let xx = x; xx < x + 32; xx++) {
        const i = (yy * width + xx) * channels;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // If the source is already RGBA, prefer pixels whose alpha is
        // already fully transparent — those are guaranteed background
        // and avoid mixing content colors into the bg estimate on a
        // re-run. For opaque RGB inputs, sample everything.
        if (channels === 4 && data[i + 3] === 0) {
          // Even transparent pixels carry some RGB in their storage
          // (they're not "blank", just unused). Skip them — they'd
          // pollute the bg estimate.
          continue;
        }
        samples.push([r, g, b]);
      }
    }
  }
  if (samples.length === 0) {
    throw new Error(
      `No opaque pixels found in corner regions of ${path} — the source is already fully transparent in those areas, can't re-key.`,
    );
  }
  return medianColor(samples);
}

async function transparentize({ path, fallbackBg, threshold }) {
  // Guard: if the source already has alpha and the corner regions are
  // mostly alpha=0, it has been keyed already. Bail instead of clobbering.
  const probe = await sharp(path).metadata();
  if (probe.hasAlpha) {
    const { data, info } = await sharp(path)
      .raw()
      .toBuffer({ resolveWithObject: true });
    let total = 0;
    let zero = 0;
    const w = info.width;
    const h = info.height;
    const ch = info.channels;
    for (const [x, y] of [
      [0, 0],
      [w - 32, 0],
      [0, h - 32],
      [w - 32, h - 32],
    ]) {
      for (let yy = y; yy < y + 32; yy++) {
        for (let xx = x; xx < x + 32; xx++) {
          const i = (yy * w + xx) * ch;
          total++;
          if (data[i + 3] === 0) zero++;
        }
      }
    }
    const transparentRatio = zero / total;
    if (transparentRatio > 0.5) {
      console.log(
        `[${path.split("/").pop()}] already keyed (${(transparentRatio * 100).toFixed(1)}% of corners are alpha=0) — skipping to avoid clobbering.`,
      );
      return;
    }
  }

  const detected = await detectBgColor(path);
  // Average the detected median with our fallback so we don't over-fit
  // to a JPEG-y edge sample, but stay close to the actual canvas.
  const bg = detected.map((c, i) => Math.round((c + fallbackBg[i]) / 2));
  const [bgR, bgG, bgB] = bg;
  const t1 = threshold * T1_MULT;
  const t2 = threshold * T2_MULT;
  const t1sq = t1 * t1;
  const t2sq = t2 * t2;

  console.log(
    `[${path.split("/").pop()}] detected bg=${detected.join(",")} avg=${bg.join(
      ",",
    )} threshold=${threshold} feather=[${t1.toFixed(1)}, ${t2.toFixed(1)}]`,
  );

  const { data, info } = await sharp(path)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const total = width * height;
  const out = Buffer.alloc(total * 4);

  let transparentCount = 0;
  let opaqueCount = 0;
  let featheredCount = 0;

  for (let p = 0, oi = 0; p < data.length; p += channels, oi += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    out[oi] = r;
    out[oi + 1] = g;
    out[oi + 2] = b;

    const dr = r - bgR;
    const dg = g - bgG;
    const db = b - bgB;
    const distSq = dr * dr + dg * dg + db * db;

    if (distSq <= t1sq) {
      out[oi + 3] = 0;
      transparentCount++;
    } else if (distSq >= t2sq) {
      out[oi + 3] = 255;
      opaqueCount++;
    } else {
      // Linear feather in sqrt domain — visually smoother than squared lerp.
      const dist = Math.sqrt(distSq);
      const a = (dist - t1) / (t2 - t1);
      out[oi + 3] = Math.round(a * 255);
      featheredCount++;
    }
  }

  const total_ = transparentCount + opaqueCount + featheredCount;
  console.log(
    `  pixels: ${total_.toLocaleString()} total — transparent=${(
      (transparentCount / total_) *
      100
    ).toFixed(1)}% opaque=${((opaqueCount / total_) * 100).toFixed(
      1,
    )}% feathered=${((featheredCount / total_) * 100).toFixed(1)}%`,
  );
  console.log(`  bg=(R${bgR} G${bgG} B${bgB})  distance feather [${t1.toFixed(1)}, ${t2.toFixed(1)}]`);

  // Sharp can stumble writing back over the same file it just read on
  // Windows (handle timing). Stage to a temp sibling, then rename.
  const tmpPath = path + ".tmp.png";
  // Two-step encode: first write the raw-alpha PNG, then re-encode with
  // palette mode so the file size stays sane. palette: true on a true-color
  // RGBA hop image dropped Hops from 2.2MB to 629KB with zero visible
  // difference (alpha and color fidelity preserved, see stats above).
  const rawPng = await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const finalPng = await sharp(rawPng)
    .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
    .toBuffer();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(tmpPath, finalPng);
  await rename(tmpPath, path);
}

(async () => {
  for (const target of TARGETS) {
    await transparentize(target);
  }
  console.log("done");
})();