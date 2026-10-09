#!/usr/bin/env node
/**
 * check.js — verify this repo is complete and ready to serve.
 *
 *   npm run check
 *   node server/check.js --fix     # create any missing folders
 *   node server/check.js --json
 *
 * Checks the documented layout, the metadata files, the player, and whether
 * an episode video (YouTube.mp4 or any supported format) is in place.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIX = process.argv.includes('--fix');
const AS_JSON = process.argv.includes('--json');

const PRIMARY = 'YouTube.mp4';
const VIDEO_EXT = ['.mp4', '.m4v', '.mkv', '.mov', '.avi', '.webm'];
const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', o: '\x1b[0m', gd: '\x1b[33m' }
  : { b: '', d: '', g: '', y: '', r: '', o: '', gd: '' };

const results = [];
const record = (level, label, detail) => results.push({ level, label, detail });
const section = (name) => results.push({ level: 'section', label: name, detail: '' });

function checkFile(rel, { required = true, minBytes = 1 } = {}) {
  const abs = path.join(ROOT, rel);
  const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
  if (!st) {
    record(required ? 'fail' : 'warn', rel, required ? 'missing' : 'optional, not present');
    return null;
  }
  if (st.isFile() && st.size < minBytes) {
    record('warn', rel, `exists but is only ${st.size} bytes (placeholder?)`);
    return st;
  }
  record('ok', rel, `${(st.size / 1024).toFixed(1)} KB`);
  return st;
}

function checkDir(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const count = fs.readdirSync(abs).length;
    record('ok', rel + '/', `${count} item${count === 1 ? '' : 's'}`);
    return true;
  }
  if (FIX) {
    fs.mkdirSync(abs, { recursive: true });
    record('fixed', rel + '/', 'created');
    return true;
  }
  record('fail', rel + '/', 'missing — run with --fix to create it');
  return false;
}

function findVideo() {
  const dirs = ['', 'assets/videos', 'assets', 'media', 'video', 'public'];
  for (const name of [PRIMARY, PRIMARY.toLowerCase()]) {
    for (const d of dirs) {
      const p = path.join(ROOT, d, name);
      if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) return p;
    }
  }
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      if (VIDEO_EXT.includes(path.extname(f).toLowerCase())) {
        const p = path.join(abs, f);
        if (fs.statSync(p).size > 0) return p;
      }
    }
  }
  return null;
}

function checkJSON(rel) {
  const abs = path.join(ROOT, rel);
  try {
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const keys = Object.keys(data).slice(0, 5).join(', ');
    record('ok', rel, `valid JSON · ${keys}…`);
    return data;
  } catch (err) {
    record('fail', rel, `invalid JSON — ${err.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */

if (!AS_JSON) {
  console.log('');
  console.log(`${C.b}${C.gd}Watch pages · repository readiness check${C.o}`);
  console.log(`${C.d}server/check.js — Love & Hip Hop: New York (S3 Sneak Peek + Reunion Part 2) · Basketball Wives${C.o}`);
  console.log('─'.repeat(70));
}

section('Layout');
checkDir('docs');
checkDir('metadata');
checkDir('scripts');
checkDir('assets/thumbnails');
checkDir('assets/posters');
checkDir('public');
checkDir('public/assets/img');
checkDir('server');

section('Documentation');
checkFile('README.md');
checkFile('docs/episode-guide.md');
checkFile('docs/cast-info.md');

section('Metadata');
const episodeData = checkJSON('metadata/episode-data.json');
checkJSON('metadata/timestamps.json');
const bwData = checkJSON('metadata/basketball-wives-data.json');
checkJSON('metadata/basketball-wives-timestamps.json');
const peekData = checkJSON('metadata/sneak-peek-data.json');
checkJSON('metadata/sneak-peek-timestamps.json');

section('Watch page');
checkFile('public/index.html');
checkFile('public/styles.css');
checkFile('public/app.js');
checkFile('public/assets/img/favicon.svg', { required: false });
checkFile('public/assets/posters/reunion-part-2-poster.jpg', { required: false });
checkFile('public/assets/thumbnails/reunion-part-2-16x9.jpg', { required: false });

section('Watch page — Season 3 Sneak Peek (landing)');
checkFile('public/index.html');
checkFile('public/assets/posters/sneak-peek-poster.jpg', { required: false });

section('Watch page — Reunion Part 2');
checkFile('public/reunion.html');

section('Watch page — Basketball Wives');
checkFile('public/basketball-wives.html');
checkFile('public/bw.css');
checkFile('public/assets/img/bw-favicon.svg', { required: false });
checkFile('public/assets/posters/basketball-wives-reunion-poster.jpg', { required: false });
checkFile('docs/basketball-wives-clip.md', { required: false });

section('Tooling');
checkFile('server/server.js');
checkFile('scripts/metadata-parser.py', { required: false });
checkFile('scripts/video-converter.sh', { required: false });
checkFile('scripts/make-placeholder-reel.sh', { required: false });
checkFile('package.json');
checkFile('.gitignore', { required: false });

/* ------------------------------------------------------------------ */

section('Episode media');
// Landing page: the Season 3 sneak peek (owns YouTube.mp4)
const PEEK_NAMES = ['YouTube.mp4', 'Love and Hip Hop Season 3 Sneak Peek.mp4', 'Love & Hip Hop Special.mp4'];
let peekReal = null;
for (const name of PEEK_NAMES) {
  for (const dir of ['', 'media', 'assets/videos']) {
    const p = path.join(ROOT, dir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) { peekReal = p; break; }
  }
  if (peekReal) break;
}
const peekReel = path.join(ROOT, 'media/placeholder/lhhny-season-3-sneak-peek-reel.mp4');
if (peekReal) {
  const st = fs.statSync(peekReal);
  record('ok', path.relative(ROOT, peekReal), `${(st.size / 1024 / 1024).toFixed(1)} MB · real clip in place`);
} else if (fs.existsSync(peekReel) && fs.statSync(peekReel).size > 0) {
  const st = fs.statSync(peekReel);
  record('warn', 'media/placeholder/lhhny-season-3-sneak-peek-reel.mp4',
    `${(st.size / 1024 / 1024).toFixed(1)} MB placeholder — drop YouTube.mp4 to swap`);
} else {
  record('warn', 'YouTube.mp4', 'no clip and no placeholder reel — run: npm run peek:reel');
}

const BW_NAMES = [
  'Basketball Wives Reunion Sneak Peek.mp4',
  'Basketball Wives Reunion Sneak Peek - YouTube.mp4',
  'BasketballWives-Reunion-SneakPeek.mp4'
];
let bwReal = null;
for (const name of BW_NAMES) {
  for (const dir of ['', 'media', 'assets/videos', 'assets']) {
    const p = path.join(ROOT, dir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) { bwReal = p; break; }
  }
  if (bwReal) break;
}
const bwReel = path.join(ROOT, 'media/placeholder/basketball-wives-reunion-reel.mp4');
if (bwReal) {
  const st = fs.statSync(bwReal);
  record('ok', path.relative(ROOT, bwReal), `${(st.size / 1024 / 1024).toFixed(1)} MB · real clip in place`);
} else if (fs.existsSync(bwReel) && fs.statSync(bwReel).size > 0) {
  const st = fs.statSync(bwReel);
  record('warn', 'media/placeholder/basketball-wives-reunion-reel.mp4',
    `${(st.size / 1024 / 1024).toFixed(1)} MB placeholder — drop ${BW_NAMES[0]} for the real clip`);
} else {
  record('warn', BW_NAMES[0], 'no clip and no placeholder reel — run: npm run reel');
}

const json = process.argv.includes('--json');

/* ------------------------------------------------------------------ */

if (!AS_JSON) {
  for (const r of results) {
    if (r.level === 'section') {
      console.log(`\n${C.d}${r.label}${C.o}`);
      continue;
    }
    const mark = { ok: `${C.g}✓${C.o}`, warn: `${C.y}!${C.o}`, fail: `${C.r}✗${C.o}`, fixed: `${C.g}+${C.o}` }[r.level];
    console.log(`  ${mark} ${r.label.padEnd(42)} ${C.d}${r.detail}${C.o}`);
  }

  const fails = results.filter((r) => r.level === 'fail');
  const warns = results.filter((r) => r.level === 'warn');

  console.log('\n' + '─'.repeat(70));
  console.log(`  ${C.g}${results.filter((r) => r.level === 'ok').length} passed${C.o}` +
              ` · ${C.y}${warns.length} warning${warns.length === 1 ? '' : 's'}${C.o}` +
              ` · ${C.r}${fails.length} failed${C.o}`);

  if (peekReal) {
    console.log(`\n  ${C.b}Media ready${C.o} — ${path.relative(ROOT, peekReal)} (${(fs.statSync(peekReal).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log(`\n  ${C.b}${C.y}Next step:${C.o} copy the sneak-peek clip to ${C.b}${path.join(ROOT, PRIMARY)}${C.o}`);
    console.log(`  ${C.d}They also play from media/, assets/videos/ or assets/ with the same name.${C.o}`);
    console.log(`  Or stream from elsewhere:  VIDEO_URL=https://…/${PRIMARY} npm start${C.o}`);
  }

  console.log(`\n  ${C.d}Start the site:  npm start      ·      Probe the file:  npm run info${C.o}`);
  if (episodeData && episodeData.episode) {
    const e = episodeData.episode;
    console.log(`  ${C.d}${episodeData.show.title} — S${e.seasonNumber} E${e.episodeNumber} "${e.title}" · ${e.airDate} · ${episodeData.show.network}${C.o}`);
  }
  if (peekData && peekData.episode) {
    const e = peekData.episode;
    console.log(`  ${C.d}${peekData.show.title} — ${e.title} · aired ${e.airDate} · ${peekData.show.network}${C.o}`);
  }
  if (bwData && bwData.episode) {
    const e = bwData.episode;
    console.log(`  ${C.d}${bwData.show.title} — ${e.title} · ${e.seasonHalf || 'S' + e.seasonNumber} · ${bwData.show.network}${C.o}`);
  }
  console.log('');
}

if (AS_JSON) {
  console.log(JSON.stringify({
    ok: results.every((r) => r.level !== 'fail' || r.level === 'fixed'),
    root: ROOT,
    video: peekReal ? { path: path.relative(ROOT, peekReal), bytes: fs.statSync(peekReal).size } : null,
    results
  }, null, 2));
}

process.exit(results.some((r) => r.level === 'fail') ? 1 : 0);
