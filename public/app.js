/* =====================================================================
   Love & Hip Hop: New York — S3 E14 "Reunion: Part 2"
   Watch page: metadata rendering + custom video player.

   Media resolution: the server reports whether YouTube.mp4 (or any other
   supported video found in the repo) exists, and hands the player a URL.
   No file on disk? The player stays fully interactive and offers a
   server re-scan, a local-file preview, or a VIDEO_URL stream.
   ===================================================================== */

'use strict';

/* ------------------------------------------------------------------ *
 * Show configuration
 *
 * One player implementation drives every watch page in this repo.
 * The page declares which show it is with <html data-show="…">.
 * ------------------------------------------------------------------ */
const SHOWS = {
  lhhny: {
    key: 'lhhny',
    primaryName: 'YouTube.mp4',
    storeKey: 'lhhny.s3e14.position',
    episodeApi: '/api/episode',
    videoApi: '/api/video-info',
    showName: 'Love & Hip Hop: New York',
    episodeLabel: 'S3 E14 · VH1'
  },
  bw: {
    key: 'bw',
    primaryName: 'Basketball Wives Reunion Sneak Peek.mp4',
    storeKey: 'bw.s11reunion.peek.position',
    episodeApi: '/api/bw-episode',
    videoApi: '/api/bw-video-info',
    showName: 'Basketball Wives',
    episodeLabel: 'Reunion Sneak Peek · VH1'
  }
};
const SHOW = SHOWS[document.documentElement.dataset.show] || SHOWS.lhhny;
const PRIMARY_NAME = SHOW.primaryName;
const STORE_KEY = SHOW.storeKey;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ *
 * Tiny DOM helpers (no innerHTML for anything data-driven)
 * ------------------------------------------------------------------ */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
const svgEl = (paths, attrs = {}) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  for (const d of [].concat(paths)) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
  }
  return s;
};

const pad = (n) => String(n).padStart(2, '0');
function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
const humanBytes = (n) => {
  if (!Number.isFinite(n)) return null;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */
function toast(message, kind = '', ttl = 4200) {
  const wrap = $('#toasts');
  if (!wrap) return;
  const node = el('div', { class: `toast ${kind}`.trim() });
  node.appendChild(svgEl(kind === 'warn'
    ? ['M12 3.5 22 20.5H2Z', 'M12 10v4.5M12 17.4v.1']
    : ['m4.5 12.5 5 5 10-11'], { class: 'toast-ico' }));
  node.appendChild(el('span', { html: message }));
  wrap.appendChild(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 320);
  }, ttl);
}

/* ------------------------------------------------------------------ *
 * Player
 * ------------------------------------------------------------------ */
const video = $('#video');
const shell = $('#videoShell');
const state = {
  chapters: [],
  chaptersArePlaceholder: false,
  runtime: 0,
  seeking: false,
  objectUrl: null,
  source: 'none',
  uiTimer: null,
  speed: 1,
  lastUrlWrite: 0
};

function setNote(text) { $('#ctlNote').textContent = text || ''; }

function fmtDurLabel() {
  return video.duration ? fmtTime(video.duration) : ($('#tDur').textContent || '42:00');
}

/* ---- media loading ---- */
function loadSource(url, meta = {}) {
  if (!url) return false;
  video.src = url;
  video.load();
  shell.classList.add('has-media');
  state.source = meta.source || 'file';
  const spec = meta.player || {};
  $('#stripSource').textContent = meta.fileName || PRIMARY_NAME;
  $('#stripFormat').textContent = meta.format
    || [spec.container || 'MP4', spec.videoCodec ? spec.videoCodec.replace(/ \(AVC\)/, '') : 'H.264'].join(' · ');
  $('#stripQuality').textContent = meta.quality
    || [spec.resolutionLabel || '1080p', spec.frameRate ? spec.frameRate + ' fps' : '29.97 fps'].join(' · ');
  $('#stripAudio').textContent = meta.audio
    || [spec.audioCodec || 'AAC', spec.audioBitrateKbps ? spec.audioBitrateKbps + ' kbps' : ''].filter(Boolean).join(' · ');
  const bits = [];
  if (meta.fileName) bits.push(meta.fileName);
  if (meta.sizeLabel) bits.push(meta.sizeLabel);
  if (meta.source === 'external') bits.push('streaming from an external URL');
  else if (meta.source === 'local') bits.push('local preview — nothing uploaded');
  else if (meta.source === 'placeholder') bits.push('generated placeholder reel — original graphics, not broadcast footage');
  if (meta.source !== 'local') bits.push('byte-range seeking enabled');
  setNote(bits.join(' · '));
  return true;
}

function showLocker(message) {
  shell.classList.remove('has-media');
  if (message) {
    const foot = $('#lockerFoot');
    if (foot) foot.innerHTML = message;
  }
}

async function checkVideoInfo({ silent = false } = {}) {
  const status = $('#heroStatus');
  try {
    const res = await fetch(SHOW.videoApi + '?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const info = await res.json();
    if (info.available) {
      const ok = loadSource(info.url, {
        source: info.source,
        fileName: info.fileName,
        sizeLabel: info.sizeLabel,
        player: info.player
      });
      if (status) {
        status.innerHTML = '';
        status.appendChild(el('i', { class: info.isPlaceholder ? 'dot dot-warn' : 'dot dot-ok' }));
        status.appendChild(el('span', {
          text: info.isPlaceholder
            ? `Placeholder reel${info.sizeLabel ? ' · ' + info.sizeLabel : ''} — drop ${info.expectedName} to swap`
            : `${info.fileName}${info.sizeLabel ? ' · ' + info.sizeLabel : ''} ready`
        }));
      }
      if (!silent) {
        toast(info.isPlaceholder
          ? `Playing the generated <b>placeholder reel</b> — drop <b>${info.expectedName}</b> to swap it in`
          : `Streaming <b>${info.fileName}</b>${info.sizeLabel ? ' · ' + info.sizeLabel : ''}`,
          info.isPlaceholder ? 'warn' : '', info.isPlaceholder ? 6500 : 4200);
      }
      return info;
    }
    showLocker();
    if (status) {
      status.innerHTML = '';
      status.appendChild(el('i', { class: 'dot dot-warn' }));
      status.appendChild(el('span', { text: `Waiting for ${PRIMARY_NAME} — local preview available` }));
    }
    if (!silent) toast(`No <b>${PRIMARY_NAME}</b> in the repo yet — see the three options on the player`, 'warn', 6000);
    return info;
  } catch (err) {
    showLocker();
    if (status) {
      status.innerHTML = '';
      status.appendChild(el('i', { class: 'dot dot-warn' }));
      status.appendChild(el('span', { text: 'Server metadata unavailable' }));
    }
    if (!silent) toast('Could not read <b>' + SHOW.videoApi + '</b> — is the Node server running?', 'warn', 6000);
    return null;
  }
}

/* ---- playback helpers ---- */
function play() { video.play().catch((e) => toast('Playback blocked: ' + e.message, 'warn')); }
function toggle() { video.paused ? play() : video.pause(); }
function seekBy(delta) {
  if (!video.duration) return;
  video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration - 0.15);
  flashSkip(delta);
}
function seekTo(t) {
  if (!video.duration) { video.currentTime = Math.max(0, t); return; }
  video.currentTime = Math.min(Math.max(0, t), video.duration - 0.15);
}
function flashSkip(delta) {
  const n = $('#skipFlash');
  if (!n) return;
  n.classList.remove('left', 'right');
  n.classList.add(delta < 0 ? 'left' : 'right', 'show');
  clearTimeout(n._t);
  n._t = setTimeout(() => n.classList.remove('show'), 520);
}

function updateProgress() {
  const d = video.duration || 0;
  const pct = d ? (video.currentTime / d) * 100 : 0;
  $('#tlProgress').style.width = pct + '%';
  $('#tCur').textContent = fmtTime(video.currentTime);
  $('#tDur').textContent = d ? fmtTime(d) : fmtDurLabel();
  const tl = $('#timeline');
  tl.setAttribute('aria-valuenow', String(Math.round(pct)));
  tl.setAttribute('aria-valuetext', `${fmtTime(video.currentTime)} of ${fmtTime(d)}`);
  if (video.buffered.length) {
    try {
      const end = video.buffered.end(video.buffered.length - 1);
      $('#tlBuffer').style.width = (d ? (end / d) * 100 : 0) + '%';
    } catch { /* ignore */ }
  }
  highlightChapter();
  persistPosition();
}

function currentChapterIndex() {
  const t = video.currentTime || 0;
  let idx = -1;
  state.chapters.forEach((c, i) => { if (t >= c.start) idx = i; });
  return idx;
}

function highlightChapter() {
  const idx = currentChapterIndex();
  $$('#chapterList .chapter-item').forEach((li, i) => {
    li.classList.toggle('active', i === idx);
    if (i < idx) li.classList.add('watched');
  });
  const ch = state.chapters[idx];
  const label = $('#nowChapter');
  if (ch && label) label.textContent = ch.title;
  const activeLi = $('#chapterList .chapter-item.active');
  if (activeLi && !state.seeking) {
    const rail = $('#chapterList');
    const box = activeLi.getBoundingClientRect();
    const rbox = rail.getBoundingClientRect();
    if (box.top < rbox.top || box.bottom > rbox.bottom) {
      rail.scrollTo({ top: activeLi.offsetTop - rail.clientHeight / 2 + activeLi.clientHeight / 2, behavior: 'smooth' });
    }
  }
}

function persistPosition() {
  if (!video.duration || video.currentTime < 5) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      t: video.currentTime, d: video.duration, at: Date.now(), src: state.source
    }));
  } catch { /* storage may be blocked */ }
  const now = Date.now();
  if (now - state.lastUrlWrite > 4500) {
    state.lastUrlWrite = now;
    const url = new URL(location.href);
    if (video.currentTime > 5) url.searchParams.set('t', String(Math.floor(video.currentTime)));
    history.replaceState(null, '', url);
  }
}

function restorePosition() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* ignore */ }
  const qs = new URLSearchParams(location.search);
  const wanted = qs.get('t') ? Number(qs.get('t')) : (qs.get('chapter') ? null : (saved ? saved.t : null));

  if (qs.get('chapter')) {
    const ch = state.chapters.find((c) => c.id === qs.get('chapter'));
    if (ch) {
      seekTo(ch.start);
      toast(`Jumped to chapter · <b>${ch.title}</b>`);
      return;
    }
  }
  if (Number.isFinite(wanted) && wanted > 8 && video.duration && wanted < video.duration - 20) {
    seekTo(wanted);
    toast(`Resumed at <b>${fmtTime(wanted)}</b> — press <b>R</b> to start over`, '', 5200);
  }
}

/* ---- UI visibility ---- */
function showUI() {
  shell.classList.remove('ui-hidden');
  clearTimeout(state.uiTimer);
  if (!video.paused) state.uiTimer = setTimeout(() => shell.classList.add('ui-hidden'), 2800);
}
shell.addEventListener('mousemove', showUI);
shell.addEventListener('touchstart', showUI, { passive: true });
shell.addEventListener('mouseleave', () => { if (!video.paused) shell.classList.add('ui-hidden'); });

/* ---- video events ---- */
video.addEventListener('play', () => { shell.classList.add('is-playing'); showUI(); });
video.addEventListener('pause', () => { shell.classList.remove('is-playing'); shell.classList.remove('ui-hidden'); });
video.addEventListener('timeupdate', updateProgress);
video.addEventListener('progress', updateProgress);
video.addEventListener('durationchange', updateProgress);
video.addEventListener('loadedmetadata', () => {
  updateProgress();
  buildChapterTicks();
  restorePosition();
});
video.addEventListener('seeking', () => { state.seeking = true; });
video.addEventListener('seeked', () => { state.seeking = false; });
video.addEventListener('waiting', () => { $('#veilLoading').hidden = false; });
video.addEventListener('playing', () => { $('#veilLoading').hidden = true; $('#veilLocker').style.display = ''; });
video.addEventListener('canplay', () => { $('#veilLoading').hidden = true; });
video.addEventListener('error', () => {
  const err = video.error;
  const code = err ? err.code : 0;
  const msgs = {
    1: 'Playback aborted.',
    2: 'Network error while reading the video — the file may have moved.',
    3: 'The browser could not decode this file. Re-export as MP4 (H.264 + AAC).',
    4: `This file is not playable in the browser. Re-export as MP4 (H.264 + AAC).`
  };
  showLocker(`<strong>Playback problem:</strong> ${msgs[code] || 'Unknown error.'} Expecting <code>${PRIMARY_NAME}</code> (MP4 · H.264 · AAC).`);
  toast('Video error: ' + (msgs[code] || 'unknown'), 'warn', 7000);
});

/* ---- controls ---- */
shell.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'playpause') toggle();
  else if (action === 'back10') seekBy(-10);
  else if (action === 'fwd10') seekBy(10);
  else if (action === 'mute') { video.muted = !video.muted; syncVolUI(); }
  else if (action === 'fullscreen') toggleFullscreen();
  else if (action === 'theater') toggleTheater();
  else if (action === 'pip') togglePip();
  else if (action === 'speed') openSpeedMenu();
  else if (action === 'rescan') checkVideoInfo();
  else if (action === 'copy-link') copyMomentLink();
});

$$('[data-action="play"]').forEach((b) => b.addEventListener('click', () => {
  const target = $('#player');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (video.readyState === 0 && !video.src) { checkVideoInfo(); return; }
  play();
}));

$('#centerPlay').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
video.addEventListener('click', toggle);
video.addEventListener('dblclick', toggleFullscreen);

function syncVolUI() {
  const vol = $('#volume');
  vol.value = String(video.muted ? 0 : video.volume);
  $('#btnMute').classList.toggle('is-muted', video.muted || video.volume === 0);
}
$('#volume').addEventListener('input', (e) => {
  video.volume = Number(e.target.value);
  video.muted = video.volume === 0;
  syncVolUI();
});

function toggleFullscreen() {
  const fsEl = document.fullscreenElement;
  if (fsEl) document.exitFullscreen?.();
  else (shell.requestFullscreen?.() || shell.webkitRequestFullscreen?.()) && Promise.resolve().catch(() => {});
}
function toggleTheater() {
  const on = shell.classList.toggle('theater');
  document.body.classList.toggle('theater-open', on);
  showUI();
  toast(on ? 'Theater mode on — press <b>T</b> or Esc to exit' : 'Theater mode off');
  if (on) window.scrollTo({ top: 0 });
}
async function togglePip() {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
    else toast('Picture-in-picture is not supported in this browser', 'warn');
  } catch (e) { toast('Picture-in-picture unavailable: ' + e.message, 'warn'); }
}

let speedMenu = null;
function openSpeedMenu() {
  if (speedMenu) { speedMenu.remove(); speedMenu = null; return; }
  speedMenu = el('div', { class: 'speed-menu', role: 'menu', 'aria-label': 'Playback speed' });
  SPEEDS.forEach((s) => {
    speedMenu.appendChild(el('button', {
      type: 'button', role: 'menuitemradio',
      'aria-current': String(video.playbackRate === s),
      text: s === 1 ? 'Normal (1×)' : s + '×',
      onclick: () => { video.playbackRate = s; state.speed = s; $('#btnSpeed').textContent = s + '×'; speedMenu.remove(); speedMenu = null; toast('Speed · <b>' + s + '×</b>'); }
    }));
  });
  shell.appendChild(speedMenu);
  setTimeout(() => document.addEventListener('click', function close(ev) {
    if (speedMenu && !speedMenu.contains(ev.target)) { speedMenu.remove(); speedMenu = null; document.removeEventListener('click', close); }
  }), 0);
}

/* ---- timeline ---- */
const timeline = $('#timeline');
function pctFromEvent(e) {
  const r = timeline.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  return Math.min(1, Math.max(0, x / r.width));
}
function previewAt(e) {
  const pct = pctFromEvent(e);
  const d = video.duration || state.runtime;
  const t = pct * d;
  const tip = $('#tlTooltip');
  const ch = state.chapters.slice().reverse().find((c) => t >= c.start);
  tip.innerHTML = '';
  tip.appendChild(el('span', { text: fmtTime(t) }));
  if (ch) tip.appendChild(el('b', { text: ch.title }));
  tip.style.left = (pct * 100) + '%';
  tip.hidden = false;
}
timeline.addEventListener('mousemove', previewAt);
timeline.addEventListener('mouseleave', () => { $('#tlTooltip').hidden = true; });
timeline.addEventListener('click', (e) => {
  if (!video.duration) {
    toast(video.src ? 'Still loading the file — try again in a second'
                    : 'Load the video first — see the three options on the player', 'warn');
    return;
  }
  video.currentTime = pctFromEvent(e) * video.duration;
});
timeline.addEventListener('touchstart', (e) => {
  if (!video.duration) return;
  video.currentTime = pctFromEvent(e) * video.duration;
}, { passive: true });
timeline.addEventListener('touchmove', (e) => {
  if (!video.duration) return;
  video.currentTime = pctFromEvent(e) * video.duration;
}, { passive: true });

/* ---- chapters ---- */
function buildChapterTicks() {
  const rail = $('#tlChapters');
  rail.innerHTML = '';
  const d = video.duration || state.runtime;
  if (!d) return;
  state.chapters.forEach((c, i) => {
    if (i === 0) return;
    const tick = document.createElement('i');
    tick.style.left = ((c.start / d) * 100) + '%';
    tick.title = c.title;
    rail.appendChild(tick);
  });
}

function renderChapters(chapters, isPlaceholder, note, forReel) {
  state.chapters = chapters;
  const list = $('#chapterList');
  list.innerHTML = '';
  chapters.forEach((c, i) => {
    const item = el('li', {}, el('button', {
      class: 'chapter-item', type: 'button',
      'data-start': String(c.start),
      'aria-label': `Jump to ${c.title} at ${fmtTime(c.start)}`,
      onclick: () => {
        if (!video.duration) {
          toast(video.src
            ? 'Still loading the file — try the chapter again in a second'
            : 'Add <b>' + PRIMARY_NAME + '</b> to jump to chapters', 'warn');
          return;
        }
        seekTo(c.start);
        if (video.paused) play();
      }
    }, [
      el('span', { class: 'ch-time', text: fmtTime(c.start) }),
      el('span', { class: 'ch-body' }, [
        c.tag ? el('span', { class: 'ch-tag', text: c.tag }) : null,
        el('span', { class: 'ch-title', text: c.title }),
        c.blurb ? el('span', { class: 'ch-blurb', text: c.blurb }) : null
      ])
    ]));
    list.appendChild(item);
  });
  $('#chapterCount').textContent = `${chapters.length} marker${chapters.length === 1 ? '' : 's'}`;
  const noteEl = $('#railNote');
  const showNote = Boolean(isPlaceholder || forReel);
  noteEl.hidden = !showNote;
  if (showNote) {
    const msg = forReel
      ? 'These markers match the generated placeholder reel exactly. They will need replacing along with the video.'
      : (note || '').replace(/^_note:\s*/, '');
    noteEl.querySelector('span').textContent = msg;
  }
  state.runtime = chapters.length ? Math.max(...chapters.map((c) => c.end)) : 2520;
  $('#tDur').textContent = fmtTime(state.runtime);
}

/* ---- deep link / share ---- */
async function copyMomentLink() {
  const url = new URL(location.href);
  url.searchParams.set('t', String(Math.floor(video.currentTime || 0)));
  const ch = state.chapters[currentChapterIndex()];
  if (ch) url.searchParams.set('chapter', ch.id);
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    toast(`Link copied · <b>${fmtTime(video.currentTime)}</b>${ch ? ' · ' + ch.title : ''}`);
  } catch {
    history.replaceState(null, '', link);
    toast('Deep link in the address bar — copy it from there');
  }
}

/* ---- keyboard ---- */
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // Let form controls (volume slider, file picker) keep their own keys.
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  // A focused button already activates on Space — don't double-fire.
  if (tag === 'button' && (e.key === ' ' || e.key === 'Enter')) return;

  const key = e.key;
  if (key === ' ' || key === 'k') { e.preventDefault(); toggle(); }
  else if (key === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
  else if (key === 'ArrowRight') { e.preventDefault(); seekBy(5); }
  else if (key === 'j') seekBy(-10);
  else if (key === 'l') seekBy(10);
  else if (key === 'ArrowUp') { e.preventDefault(); video.muted = false; video.volume = Math.min(1, video.volume + 0.05); syncVolUI(); showUI(); }
  else if (key === 'ArrowDown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); video.muted = video.volume === 0; syncVolUI(); showUI(); }
  else if (key === 'm') { video.muted = !video.muted; syncVolUI(); toast(video.muted ? 'Muted' : 'Unmuted'); }
  else if (key === 'f') toggleFullscreen();
  else if (key === 't') toggleTheater();
  else if (key === 'p') togglePip();
  else if (key === 'r') { seekTo(0); toast('Back to the start'); }
  else if (key === 'Escape' && shell.classList.contains('theater')) toggleTheater();
  else if (/^[0-9]$/.test(key) && !e.shiftKey) {
    const idx = key === '0' ? 9 : Number(key) - 1;
    const ch = state.chapters[idx];
    if (ch && video.duration) { seekTo(ch.start); toast(`Chapter ${idx + 1} · <b>${ch.title}</b>`); }
  }
});

/* ---- drag & drop + local file ---- */
function useLocalFile(file) {
  if (!file) return;
  if (!/^video\//.test(file.type) && !/\.(mp4|m4v|mkv|mov|avi|webm)$/i.test(file.name)) {
    toast('That does not look like a video file', 'warn');
    return;
  }
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  loadSource(state.objectUrl, {
    source: 'local',
    fileName: file.name,
    format: file.type ? file.type.replace('video/', '').toUpperCase() : 'MP4',
    sizeLabel: humanBytes(file.size)
  });
  video.play().catch(() => {});
  toast(`Playing local copy · <b>${file.name}</b> (${humanBytes(file.size)}) — this never leaves your device`);
}
$('#localFile')?.addEventListener('change', (e) => useLocalFile(e.target.files[0]));
['dragenter', 'dragover'].forEach((ev) => shell.addEventListener(ev, (e) => { e.preventDefault(); shell.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) => shell.addEventListener(ev, (e) => { e.preventDefault(); shell.classList.remove('dragover'); }));
shell.addEventListener('drop', (e) => useLocalFile(e.dataTransfer?.files?.[0]));

$$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); toast(`Copied <b>${b.dataset.copy}</b>`); }
  catch { toast('Copy failed — select the text manually', 'warn'); }
}));

/* ------------------------------------------------------------------ *
 * Metadata rendering
 * ------------------------------------------------------------------ */
function renderEpisode(data) {
  const ep = data.episode || {};
  const show = data.show || {};
  const season = data.season || {};

  // Stats
  const stats = [
    ['Season / Episode', ep.episodeNumber ? `S${ep.seasonNumber} · E${ep.episodeNumber}` : `Season ${ep.seasonNumber}${ep.seasonHalf ? ' (' + ep.seasonHalf + ')' : ''}`],
    ['Series episode', ep.seriesNumber ? `#${ep.seriesNumber}` : null],
    ['Original air date', ep.reunionAirDate ? `${ep.airDay || ''} ${fmtDate(ep.reunionAirDate)}`.trim()
                        : (ep.airDate ? `${ep.airDay || ''} ${fmtDate(ep.airDate)}`.trim() : null)],
    ['Time slot', ep.timeSlot || null],
    ['Runtime', ep.runtimeMinutes ? `${ep.runtimeMinutes} min` : (ep.runtimeLabel ? `${ep.runtimeLabel} min` : null)],
    ['US viewers', ep.usViewersMillions ? `${ep.usViewersMillions}M` : null],
    ['Host', ep.host || null],
    ['Network', show.network || 'VH1'],
    ['Rating', ep.contentRating || 'TV-14']
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  const grid = $('#statGrid');
  grid.innerHTML = '';
  stats.forEach(([k, v]) => grid.appendChild(el('div', {}, [
    el('dt', { text: k }), el('dd', { text: v })
  ])));

  // Themes
  const chips = $('#themeChips');
  chips.innerHTML = '';
  (ep.themes || []).forEach((t) => chips.appendChild(el('li', { text: t })));

  // Crew
  const crew = $('#crewList');
  crew.innerHTML = '';
  (data.crew || []).forEach((c) => crew.appendChild(el('li', {}, [
    el('span', { text: c.name }), el('em', { text: c.department })
  ])));

  // Sources
  const srcLine = $('#sourcesLine');
  srcLine.innerHTML = '';
  srcLine.appendChild(document.createTextNode('Episode data cross-checked against: '));
  (data.sources || []).forEach((s, i) => {
    srcLine.appendChild(el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label.split('—')[0].trim() }));
    if (i < data.sources.length - 1) srcLine.appendChild(document.createTextNode(' · '));
  });

  const footSources = $('#footSources');
  if (footSources) {
    footSources.innerHTML = '';
    (data.sources || []).forEach((s) => footSources.appendChild(el('li', {},
      el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label }))));
  }

  // Cast
  const roles = [
    ['all', 'Everyone'],
    ['host', 'Host'],
    ['main', 'Cast'],
    ['guest', 'Guests'],
    ['specialist', 'Specialist'],
    ['archive', 'Archive']
  ];
  const present = roles.filter(([r]) => r === 'all' || (data.cast || []).some((c) => c.role === r));
  const filters = $('#castFilters');
  filters.innerHTML = '';
  present.forEach(([value, label], i) => {
    const count = value === 'all' ? data.cast.length : data.cast.filter((c) => c.role === value).length;
    filters.appendChild(el('button', {
      type: 'button', 'aria-pressed': String(i === 0), 'data-filter': value,
      onclick: () => {
        $$('#castFilters button').forEach((b) => b.setAttribute('aria-pressed', String(b === filters.children[i])));
        paintCast(value);
      }
    }, [label + ' ', el('span', { class: 'count', text: String(count) })]));
  });

  function paintCast(filter) {
    const gridC = $('#castGrid');
    gridC.innerHTML = '';
    (data.cast || []).filter((c) => filter === 'all' || c.role === filter).forEach((c) => {
      const roleLabel = ({ host: 'Host', main: 'Cast', guest: 'Guest', specialist: 'Specialist', archive: 'Archive footage' })[c.role] || c.role;
      gridC.appendChild(el('li', { class: `cast-card role-${c.role}${c.pending ? ' pending' : ''}` }, [
        el('span', { class: 'avatar', text: c.initials || c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2), 'aria-hidden': 'true' }),
        el('span', { class: 'cast-meta' }, [
          el('strong', { text: c.name }),
          el('span', { text: c.credit }),
          el('span', { class: 'role-badge', text: roleLabel }),
          c.pending ? el('span', { class: 'pending-tag', text: 'unconfirmed' }) : null
        ])
      ]));
    });
  }
  paintCast('all');

  // Season episode guide
  const list = $('#episodeList');
  list.innerHTML = '';
  (data.seasonEpisodes || []).forEach((e) => {
    list.appendChild(el('li', { class: 'episode-row' + (e.isCurrent ? ' current' : '') }, [
      el('span', { class: 'ep-num', text: 'E' + pad(e.number) }),
      el('span', { class: 'ep-title', text: e.title }),
      el('span', { class: 'ep-date', text: fmtDate(e.airDate) }),
      e.isCurrent ? el('span', { class: 'ep-flag', text: 'This episode' }) : null
    ]));
  });

  // Specs
  const tbody = $('#specTable tbody');
  tbody.innerHTML = '';
  const media = data.media || {};
  const specs = media.specs || {};
  const rows = [
    ['Container', specs.container || 'MP4'],
    ['Resolution', specs.resolutionLabel || '1080p (Full HD)'],
    ['Frame rate', specs.frameRate ? specs.frameRate + ' fps' : '29.97 fps'],
    ['Video codec', specs.videoCodec || 'H.264'],
    ['Audio codec', specs.audioCodec || 'AAC'],
    ['Audio bitrate', specs.audioBitrateKbps ? specs.audioBitrateKbps + ' kbps' : '128 kbps'],
    ['Aspect ratio', specs.aspectRatio || '16:9'],
    ['Expected file', media.primaryFile || PRIMARY_NAME]
  ];
  rows.forEach(([k, v]) => tbody.appendChild(el('tr', {}, [el('th', { text: k }), el('td', { text: v })])));

  // Formats
  const formats = $('#formatChips');
  formats.innerHTML = '';
  (media.supportedFormats || ['MP4', 'M4V', 'MKV', 'AVI', 'MOV']).forEach((f) => formats.appendChild(el('li', { text: f })));

  // Chapters
  renderChapters(data.chapters || [], data.chaptersArePlaceholder, data.chaptersNote, data.chaptersForPlaceholderReel);

  // Verification checklist (shows whose source material still needs confirming)
  const verifyHost = $('#verifyList');
  if (verifyHost && (data.pendingVerification || []).length) {
    verifyHost.innerHTML = '';
    data.pendingVerification.forEach((item) => {
      const done = /\b(whom|confirmed)\b/i.test(item) && false;   // resolved items are removed from the JSON, not flagged here
      verifyHost.appendChild(el('li', { class: done ? 'done' : '' }, item));
    });
  } else if (verifyHost) {
    const card = verifyHost.closest('.card');
    if (card) card.style.display = 'none';
  }

  // Season context strip (optional)
  const ctxHost = $('#seasonContext');
  if (ctxHost && data.seasonContext) {
    const sc = data.seasonContext;
    const blocks = [];
    if (sc.elevenA) blocks.push(['Season 11A', `${fmtDate(sc.elevenA.premiere)} – ${fmtDate(sc.elevenA.reunion)}`, `Reunion hosted by ${sc.elevenA.reunionHost}`]);
    if (sc.elevenB) blocks.push(['Season 11B', `${fmtDate(sc.elevenB.premiere)} – ${fmtDate(sc.elevenB.reunion)}`, `${sc.elevenB.reunionTitle || 'Reunion'} · hosted by ${sc.elevenB.reunionHost}`]);
    if (sc.nextSeason && sc.nextSeason.note) blocks.push(['Next on VH1', 'Season 12', sc.nextSeason.note]);
    ctxHost.innerHTML = '';
    blocks.forEach(([label, big, small]) => ctxHost.appendChild(el('div', { class: 'ctx' }, [
      el('h4', { text: label }), el('strong', { text: big }), el('span', { text: small })
    ])));
  }

  // Hero micro-copy from data, when the page opts in
  const heroDate = $('#heroDate');
  if (heroDate && (ep.reunionAirDate || ep.airDate)) {
    heroDate.textContent = `${ep.reunionTitle || ep.title || 'Reunion'} · ${fmtDate(ep.reunionAirDate || ep.airDate)}`;
  }
  const heroRuntime = $('#heroRuntime');
  if (heroRuntime && (ep.runtimeLabel || ep.runtimeMinutes)) {
    heroRuntime.textContent = `${ep.runtimeLabel || ep.runtimeMinutes + ' min'} ${ep.type === 'sneak-peek' ? 'preview' : ''}`.trim();
  }
  const heroHost = $('#heroHost');
  if (heroHost && ep.host) heroHost.textContent = ep.host;

  // Title / meta from data
  if (ep.title) {
    const parts = [ep.title, show.shortTitle || SHOW.showName];
    if (ep.seasonNumber) parts.push(`S${ep.seasonNumber}${ep.episodeNumber ? ' E' + ep.episodeNumber : ''}`);
    document.title = `${parts.join(' — ')} | Watch`;
  }
}

/* ------------------------------------------------------------------ *
 * Nav: scrollspy + mobile toggle
 * ------------------------------------------------------------------ */
function initNav() {
  const toggleBtn = $('.nav-toggle');
  const nav = $('#site-nav');
  toggleBtn?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', String(open));
  });
  nav?.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { nav.classList.remove('open'); toggleBtn.setAttribute('aria-expanded', 'false'); }
  });

  const header = $('.site-header');
  const sections = $$('main section[id]');
  const links = $$('#site-nav a');
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 12);
    const y = window.scrollY + 140;
    let current = null;
    sections.forEach((s) => { if (s.offsetTop <= y) current = s.id; });
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + current));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
async function boot() {
  initNav();
  syncVolUI();
  try {
    const res = await fetch(SHOW.episodeApi, { cache: 'no-store' });
    const data = await res.json();
    renderEpisode(data);
    buildChapterTicks();
  } catch (e) {
    console.warn('Metadata fetch failed', e);
    toast('Metadata unavailable — running on built-in defaults', 'warn');
  }
  await checkVideoInfo({ silent: true });
  if (location.search.includes('t=') || location.search.includes('chapter=')) {
    setTimeout(() => play(), 600);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
