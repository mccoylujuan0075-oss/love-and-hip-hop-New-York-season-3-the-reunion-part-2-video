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

console.log('');
console.log(`${C.b}${C.gd}Love & Hip Hop: New York · S3 E14 · Reunion: Part 2${C.o}`);
console.log(`${C.d}repository readiness check — server/check.js${C.o}`);
console.log('─'.repeat(70));

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

section('Watch page');
checkFile('public/index.html');
checkFile('public/styles.css');
checkFile('public/app.js');
checkFile('public/assets/img/favicon.svg', { required: false });
checkFile('public/assets/posters/reunion-part-2-poster.jpg', { required: false });
checkFile('public/assets/thumbnails/reunion-part-2-16x9.jpg', { required: false });

section('Tooling');
checkFile('server/server.js');
checkFile('scripts/metadata-parser.py', { required: false });
checkFile('scripts/video-converter.sh', { required: false });
checkFile('package.json');
checkFile('.gitignore', { required: false });

/* ------------------------------------------------------------------ */

section('Episode media');
const videoPath = findVideo();
let videoInfo = null;
if (videoPath) {
  const st = fs.statSync(videoPath);
  const rel = path.relative(ROOT, videoPath);
  const mb = st.size / 1024 / 1024;
  videoInfo = { path: rel, bytes: st.size, mtime: st.mtime.toISOString() };
  record(rel === PRIMARY ? 'ok' : 'warn', rel,
    `${mb.toFixed(1)} MB · modified ${st.mtime.toISOString().slice(0, 16).replace('T', ' ')}` +
    (rel === PRIMARY ? '' : ` — expected the file to be named ${PRIMARY}`));
} else {
  record('warn', PRIMARY, 'not in the repo yet — the site runs and shows the add-your-file locker');
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

  if (videoInfo) {
    console.log(`\n  ${C.b}Media ready${C.o} — ${videoInfo.path} (${(videoInfo.bytes / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log(`\n  ${C.b}${C.y}Next step:${C.o} copy the episode to ${C.b}${path.join(ROOT, PRIMARY)}${C.o}`);
    console.log(`  ${C.d}Any of these also work: assets/videos/${PRIMARY}, assets/${PRIMARY}, media/${PRIMARY}`);
    console.log(`  Or stream from elsewhere:  VIDEO_URL=https://…/${PRIMARY} npm start${C.o}`);
  }

  console.log(`\n  ${C.d}Start the site:  npm start      ·      Probe the file:  npm run info${C.o}`);
  if (episodeData && episodeData.episode) {
    const e = episodeData.episode;
    console.log(`  ${C.d}${episodeData.show.title} — S${e.seasonNumber} E${e.episodeNumber} "${e.title}" · ${e.airDate} · ${episodeData.show.network}${C.o}`);
  }
  console.log('');
}

if (AS_JSON) {
  console.log(JSON.stringify({
    ok: results.every((r) => r.level !== 'fail' || r.level === 'fixed'),
    root: ROOT,
    video: videoInfo,
    results
  }, null, 2));
}

process.exit(results.some((r) => r.level === 'fail') ? 1 : 0);
