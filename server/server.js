#!/usr/bin/env node
/**
 * Love & Hip Hop: New York — S3E14 "Reunion: Part 2"
 * Zero-dependency watch-page + video streaming server.
 *
 *   node server/server.js            # http://0.0.0.0:3000
 *   PORT=8080 npm start
 *
 * Video source resolution order (first match wins):
 *   1. $VIDEO_FILE                       (explicit override, path or absolute)
 *   2. ./YouTube.mp4                     (the file this repo is built around)
 *   3. any *.mp4 / *.m4v / *.mkv / *.mov / *.avi in the repo root
 *   4. assets/videos/, assets/, media/, video/, public/ (same name first)
 *   5. $VIDEO_URL                        (external/CDN URL handed to the player)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const METADATA_DIR = path.join(ROOT, 'metadata');

const HOST = process.env.HOST || '0.0.0.0';
const BASE_PORT = Number(process.env.PORT || 3000);
const EXTERNAL_URL = process.env.VIDEO_URL || '';

const VIDEO_EXT = ['.mp4', '.m4v', '.mkv', '.mov', '.avi', '.webm'];
const SEARCH_DIRS = ['', 'assets/videos', 'assets', 'media', 'video', 'public', 'assets/media'];

/* ------------------------------------------------------------------ *
 * Shows
 *
 * Each watch page streams its own file. A show resolves to the first
 * candidate that exists; if none does, a show may declare a placeholder
 * reel so its page still demonstrates the whole player pipeline.
 * ------------------------------------------------------------------ */
const SHOWS = {
  lhhny: {
    key: 'lhhny',
    label: 'Love & Hip Hop: New York',
    primaryName: 'YouTube.mp4',
    names: ['YouTube.mp4'],
    dirs: SEARCH_DIRS,
    anyVideo: true,                 // fall back to any video in the search dirs
    metadata: 'metadata/episode-data.json',
    timestamps: 'metadata/timestamps.json',
    page: 'public/index.html',
    url: '/media/YouTube.mp4'
  },
  bw: {
    key: 'bw',
    label: 'Basketball Wives',
    primaryName: 'Basketball Wives Reunion Sneak Peek.mp4',
    names: [
      'Basketball Wives Reunion Sneak Peek.mp4',
      'Basketball Wives Reunion Sneak Peek - YouTube.mp4',
      'BasketballWives-Reunion-SneakPeek.mp4',
      'basketball-wives-reunion-sneak-peek.mp4'
    ],
    dirs: ['', 'media', 'assets/videos', 'assets', 'video', 'public', 'downloads'],
    anyVideo: false,                // only the names above — never another show's file
    placeholder: 'media/placeholder/basketball-wives-reunion-reel.mp4',
    metadata: 'metadata/basketball-wives-data.json',
    timestamps: 'metadata/basketball-wives-timestamps.json',
    page: 'public/basketball-wives.html',
    url: '/media/bw/stream'
  }
};

const PRIMARY_NAME = SHOWS.lhhny.primaryName;   // legacy alias

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function humanBytes(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

/** Locate a show's video file. Exact filenames win, then (for lhhny) any video. */
function findShowVideo(showKey) {
  const show = typeof showKey === 'string' ? SHOWS[showKey] : showKey;
  if (!show) return null;
  const candidates = [];

  if (process.env.VIDEO_FILE) {
    const vf = process.env.VIDEO_FILE;
    candidates.push(path.isAbsolute(vf) ? vf : path.join(ROOT, vf));
  }

  // Exact names, in priority order of locations.
  for (const dir of show.dirs) {
    for (const name of show.names) {
      candidates.push(path.join(ROOT, dir, name));
      candidates.push(path.join(ROOT, dir, name.toLowerCase()));
    }
  }

  // Any video file of a supported type (opt-in per show).
  if (show.anyVideo) {
    for (const dir of show.dirs) {
      const abs = path.join(ROOT, dir);
      const st = statSafe(abs);
      if (!st || !st.isDirectory()) continue;
      let entries = [];
      try { entries = fs.readdirSync(abs); } catch { continue; }
      for (const name of entries.sort()) {
        if (VIDEO_EXT.includes(path.extname(name).toLowerCase())) candidates.push(path.join(abs, name));
      }
    }
  }

  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    const st = statSafe(c);
    if (st && st.isFile() && st.size > 0) {
      const rel = path.relative(ROOT, c).split(path.sep).join('/');
      return {
        file: c,
        rel,
        size: st.size,
        mtime: st.mtime.toISOString(),
        isPlaceholder: Boolean(show.placeholder) && rel === show.placeholder
      };
    }
  }

  // Nothing real found — fall back to the show's placeholder reel, if any.
  if (show.placeholder) {
    const p = path.join(ROOT, show.placeholder);
    const st = statSafe(p);
    if (st && st.isFile() && st.size > 0) {
      return {
        file: p,
        rel: show.placeholder,
        size: st.size,
        mtime: st.mtime.toISOString(),
        isPlaceholder: true
      };
    }
  }
  return null;
}

function findVideo() { return findShowVideo('lhhny'); }

function videoInfoFor(showKey) {
  const show = SHOWS[showKey] || SHOWS.lhhny;
  const found = findShowVideo(show);
  const expected = show.primaryName;

  if (found) {
    const url = show.key === 'bw' ? show.url : `/media/${encodeURIComponent(path.basename(found.file))}`;
    return {
      available: true,
      source: found.isPlaceholder ? 'placeholder' : 'file',
      isPlaceholder: Boolean(found.isPlaceholder),
      fileName: path.basename(found.file),
      expectedName: expected,
      relativePath: found.rel,
      url,
      bytes: found.size,
      sizeLabel: humanBytes(found.size),
      modified: found.mtime,
      rangeRequests: true,
      ...(found.isPlaceholder ? {
        note: 'Streaming the generated placeholder reel — this is original graphics, not broadcast footage.',
        hint: `Drop ${expected} in the repository root (or media/) and reload — no restart needed.`
      } : {})
    };
  }

  if (EXTERNAL_URL) {
    return {
      available: true,
      source: 'external',
      isPlaceholder: false,
      fileName: expected,
      relativePath: EXTERNAL_URL,
      url: EXTERNAL_URL,
      bytes: null,
      sizeLabel: null,
      modified: null,
      rangeRequests: true
    };
  }

  return {
    available: false,
    source: 'none',
    isPlaceholder: false,
    fileName: expected,
    relativePath: expected,
    url: null,
    bytes: null,
    sizeLabel: null,
    modified: null,
    rangeRequests: true,
    expectedLocations: show.dirs.filter(Boolean).map((d) => `${d}/${expected}`).concat(`${expected} (repo root)`),
    hint: `Drop ${expected} in the repository root and reload — no restart needed. Or start the server with VIDEO_URL=https://... to stream from a CDN.`
  };
}

function videoInfo() { return videoInfoFor('lhhny'); }

function episodePayload(showKey) {
  const show = SHOWS[showKey] || SHOWS.lhhny;
  const data = readJSON(path.join(ROOT, show.metadata)) || {};
  const chapters = readJSON(path.join(ROOT, show.timestamps)) || {};
  return {
    ok: true,
    showKey: show.key,
    episode: data.episode || null,
    show: data.show || null,
    season: data.season || null,
    cast: data.cast || [],
    crew: data.crew || [],
    media: data.media || null,
    seasonEpisodes: data.seasonEpisodes || [],
    seasonContext: data.seasonContext || null,
    sources: data.sources || [],
    rights: data.rights || null,
    pendingVerification: data._pendingVerification || [],
    pdfNote: data._pdfNote || null,
    chapters: chapters.chapters || [],
    chaptersArePlaceholder: Boolean(chapters._placeholder),
    chaptersForPlaceholderReel: Boolean(chapters._forPlaceholderReel),
    chaptersNote: chapters._note || null,
    runtimeSeconds: chapters.runtimeSeconds || null
  };
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function sendJSON(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body, null, 2));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function safeJoin(base, target) {
  const resolved = path.resolve(base, '.' + path.posix.normalize('/' + target.replace(/\\/g, '/')));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

/* ------------------------------------------------------------------ *
 * Streaming with byte-range support (seeking, resuming, Safari)
 * ------------------------------------------------------------------ */

function streamVideo(req, res, filePath, opts = {}) {
  const stat = statSafe(filePath);
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Video file not found.');
    return;
  }

  const total = stat.size;
  const type = mimeFor(filePath);
  const range = req.headers.range;

  const baseHeaders = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Last-Modified': stat.mtime.toUTCString(),
    'ETag': `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`
  };

  if (opts.download) {
    baseHeaders['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
  }

  if (!range) {
    res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
    return;
  }

  // bytes=start-end | bytes=start- | bytes=-suffix
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' });
    res.end();
    return;
  }

  let start;
  let end;
  if (match[1] === '') {
    const suffix = parseInt(match[2], 10);
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(match[1], 10);
    end = match[2] === '' ? total - 1 : Math.min(parseInt(match[2], 10), total - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' });
    res.end();
    return;
  }

  const chunkSize = end - start + 1;
  res.writeHead(206, {
    ...baseHeaders,
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Content-Length': chunkSize
  });

  if (req.method === 'HEAD') { res.end(); return; }

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

/* ------------------------------------------------------------------ *
 * Static files
 * ------------------------------------------------------------------ */

function serveStatic(req, res, mountDir, urlPath) {
  const filePath = safeJoin(mountDir, urlPath);
  if (!filePath) { res.writeHead(403); res.end('Forbidden'); return true; }

  const stat = statSafe(filePath);
  if (!stat) return false;

  if (stat.isDirectory()) {
    const index = path.join(filePath, 'index.html');
    if (statSafe(index)) { serveFile(req, res, index, statSafe(index)); return true; }
    return false;
  }
  serveFile(req, res, filePath, stat);
  return true;
}

function serveFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': mimeFor(filePath),
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': ['html', 'json'].includes(ext.replace('.', '')) ? 'no-cache' : 'public, max-age=3600'
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

/* ------------------------------------------------------------------ *
 * Request router
 * ------------------------------------------------------------------ */

const server = http.createServer((req, res) => {
  const started = Date.now();
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const method = req.method || 'GET';

  res.on('finish', () => {
    const ms = Date.now() - started;
    // Keep logs readable — video range requests are noisy.
    const quiet = pathname.startsWith('/media/') && res.statusCode === 206;
    if (!quiet) console.log(`${method} ${pathname} -> ${res.statusCode} (${ms}ms)`);
  });

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    res.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' });
    res.end();
    return;
  }

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range' });
    res.end();
    return;
  }

  if (pathname === '/healthz') {
    const shows = Object.keys(SHOWS).map((k) => {
      const info = videoInfoFor(k);
      return { key: k, label: SHOWS[k].label, available: info.available, source: info.source, isPlaceholder: info.isPlaceholder };
    });
    sendJSON(res, 200, {
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      video: shows[0].available,          // backwards-compatible field
      source: shows[0].source,
      shows
    });
    return;
  }

  // ── episode metadata ───────────────────────────────────────────────
  if (pathname === '/api/episode' || pathname === '/api/bw-episode') {
    sendJSON(res, 200, episodePayload(pathname === '/api/bw-episode' ? 'bw' : 'lhhny'));
    return;
  }

  // ── video availability ─────────────────────────────────────────────
  if (pathname === '/api/video-info' || pathname === '/api/bw-video-info') {
    const key = pathname === '/api/bw-video-info' ? 'bw' : 'lhhny';
    const show = SHOWS[key];
    const data = readJSON(path.join(ROOT, show.metadata)) || {};
    sendJSON(res, 200, {
      ok: true,
      showKey: key,
      expected: show.primaryName,
      player: data.media && data.media.specs ? data.media.specs : null,
      supportedFormats: (data.media && data.media.supportedFormats) || ['MP4', 'M4V', 'MKV', 'AVI', 'MOV'],
      ...videoInfoFor(key)
    });
    return;
  }

  // ── page aliases ───────────────────────────────────────────────────
  if (pathname === '/basketball-wives' || pathname === '/basketball-wives/') {
    serveStatic(req, res, PUBLIC_DIR, 'basketball-wives.html');
    return;
  }
  if (pathname === '/love-and-hip-hop' || pathname === '/love-and-hip-hop/') {
    serveStatic(req, res, PUBLIC_DIR, 'index.html');
    return;
  }

  // ── media ──────────────────────────────────────────────────────────
  // /media/<show>/stream  → that show's resolved video (real file or placeholder)
  const showStream = /^\/media\/([a-z0-9_-]+)\/stream\/?$/.exec(pathname);
  if (showStream) {
    const key = showStream[1];
    if (!SHOWS[key]) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'unknown-show', shows: Object.keys(SHOWS) }, null, 2));
      return;
    }
    const found = findShowVideo(key);
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'video-missing', expected: SHOWS[key].primaryName, hint: videoInfoFor(key).hint }, null, 2));
      return;
    }
    streamVideo(req, res, found.file, { download: parsed.searchParams.get('download') === '1' });
    return;
  }

  // /media/<file> and /<file>.mp4 → the file if it exists, else the lhhny show video
  if (pathname.startsWith('/media/') || (pathname.startsWith('/') && VIDEO_EXT.includes(path.extname(pathname).toLowerCase()))) {
    const name = path.basename(pathname);
    const direct = safeJoin(ROOT, name);
    if (direct && statSafe(direct)) {
      streamVideo(req, res, direct, { download: parsed.searchParams.get('download') === '1' });
      return;
    }
    const looksLikeVideo = VIDEO_EXT.includes(path.extname(name).toLowerCase()) || name.toLowerCase() === PRIMARY_NAME.toLowerCase();
    const found = looksLikeVideo ? findShowVideo('lhhny') : null;
    if (found) {
      streamVideo(req, res, found.file, { download: parsed.searchParams.get('download') === '1' });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'video-missing', expected: PRIMARY_NAME, hint: videoInfo().hint }, null, 2));
    return;
  }

  // Docs / metadata / assets exposed read-only for convenience.
  const mounts = [
    { prefix: '/assets/', dir: path.join(ROOT, 'assets') },
    { prefix: '/metadata/', dir: METADATA_DIR },
    { prefix: '/docs/', dir: path.join(ROOT, 'docs') },
    { prefix: '/media/placeholder/', dir: path.join(ROOT, 'media', 'placeholder') }
  ];
  for (const m of mounts) {
    if (pathname.startsWith(m.prefix)) {
      if (serveStatic(req, res, m.dir, pathname.slice(m.prefix.length))) return;
    }
  }

  // Public site (default mount).
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (serveStatic(req, res, PUBLIC_DIR, rel)) return;

  // SPA-ish fallback for extensionless paths.
  if (!path.extname(pathname)) {
    if (serveStatic(req, res, PUBLIC_DIR, 'index.html')) return;
  }

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    '<!doctype html><meta charset="utf-8"><title>404</title>' +
    '<body style="font:16px/1.5 system-ui;background:#0d0618;color:#fff;padding:48px">' +
    '<h1 style="color:#f0c75e">404</h1><p>Nothing at <code>' + pathname + '</code>.</p>' +
    '<p><a style="color:#c4b5fd" href="/">Back to the watch page</a></p></body>'
  );
});

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function listen(port, attemptsLeft = 12) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} in use — trying ${port + 1}…`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('Server error:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    const line = '─'.repeat(70);
    console.log(line);
    console.log('  WATCH PAGES + STREAMING SERVER');
    console.log(line);
    console.log(`  Local:    http://localhost:${port}`);
    if (lan) console.log(`  Network:  http://${lan.address}:${port}`);
    console.log(`  Root:     ${ROOT}`);
    console.log('');
    console.log(`  Pages    /                              Love & Hip Hop: New York · S3 E14`);
    console.log(`           /basketball-wives               Basketball Wives · Reunion Sneak Peek`);
    console.log('');
    for (const key of Object.keys(SHOWS)) {
      const show = SHOWS[key];
      const info = videoInfoFor(key);
      const tag = String(show.label).padEnd(28);
      if (info.available && info.source === 'file') {
        console.log(`  ${tag} ${info.relativePath}  (${info.sizeLabel}) — byte-range streaming`);
      } else if (info.available && info.source === 'placeholder') {
        console.log(`  ${tag} placeholder reel (${info.sizeLabel}) — drop ${show.primaryName}`);
      } else if (info.available && info.source === 'external') {
        console.log(`  ${tag} external → ${info.relativePath}`);
      } else {
        console.log(`  ${tag} NOT FOUND — expected ${show.primaryName}`);
      }
    }
    console.log(line);
  });
}

listen(BASE_PORT);
