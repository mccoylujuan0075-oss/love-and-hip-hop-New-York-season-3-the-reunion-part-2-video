/* ═══════════════════════════════════════════════════════════════════
   Love & Hip Hop: New York — S2 E7 Sneak Peek
   HLS (.m3u8) player controller.

   Transport: HLS only. The engine is hls.js, vendored into this repo at
   /vendor/hls.min.js — no CDN, no SDK, no third-party embed. On Safari /
   iOS the browser plays the identical .m3u8 natively and hls.js stands
   down. There is no progressive mp4 path anywhere in this file.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

(function () {

  var LS_KEY = 'lhhny.s2e7.m3u8';
  var CONFIG_URLS = ['/api/s2e7-stream', '/metadata/s2e7-stream.json'];
  var DATA_URLS   = ['/api/s2e7-episode', '/metadata/s2e7-data.json'];

  var $ = function (id) { return document.getElementById(id); };

  var video   = $('video');
  var plate   = $('plate');
  var plateT  = $('plateTitle');
  var plateX  = $('plateText');
  var plateH  = $('plateHint');
  var bigPlay = $('bigPlay');

  var playBtn = $('playBtn');
  var muteBtn = $('muteBtn');
  var scrub   = $('scrub');
  var vol     = $('vol');
  var quality = $('quality');
  var fsBtn   = $('fsBtn');
  var tNow    = $('tNow');
  var tEnd    = $('tEnd');

  var srcInput = $('srcInput');
  var loadBtn  = $('loadBtn');
  var resetBtn = $('resetBtn');

  var bar      = $('statusbar');
  var stState  = $('stState');
  var stSrc    = $('stSrc');
  var stLevels = $('stLevels');
  var stRate   = $('stRate');
  var stBuf    = $('stBuf');
  var engineTag = $('engineTag');

  var hls = null;
  var sources = [];      // ordered candidate playlists
  var sourceIndex = 0;
  var scrubbing = false;
  var frame = document.querySelector('.frame');

  /* ── helpers ──────────────────────────────────────────────────── */

  function isM3U8(url) {
    return typeof url === 'string' && /\.m3u8(\?|#|$)/i.test(url.trim());
  }

  function clock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }

  function shortUrl(url) {
    if (!url) return '—';
    try {
      var u = new URL(url, location.href);
      var last = u.pathname.split('/').filter(Boolean).pop() || u.pathname;
      return u.hostname + '/…/' + last;
    } catch (e) { return url.slice(0, 48); }
  }

  function state(kind, text) {
    bar.classList.remove('is-live', 'is-error');
    if (kind === 'live')  bar.classList.add('is-live');
    if (kind === 'error') bar.classList.add('is-error');
    stState.textContent = text;
  }

  function showPlate(title, text, hint, withButton) {
    plateT.textContent = title;
    plateX.textContent = text;
    plateH.textContent = hint || '';
    bigPlay.style.display = withButton ? '' : 'none';
    plate.hidden = false;
  }
  function hidePlate() { plate.hidden = true; }

  function getJSON(urls) {
    var i = 0;
    function attempt() {
      if (i >= urls.length) return Promise.resolve(null);
      var u = urls[i++];
      return fetch(u, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : attempt(); })
        .catch(attempt);
    }
    return attempt();
  }

  /* ── source list ──────────────────────────────────────────────── */

  function buildSources(cfg) {
    var list = [];
    var saved = null;
    try { saved = localStorage.getItem(LS_KEY); } catch (e) { saved = null; }

    var qs = new URLSearchParams(location.search).get('src');
    if (isM3U8(qs)) list.push({ label: 'URL parameter', url: qs.trim() });
    if (isM3U8(saved)) list.push({ label: 'Your saved stream', url: saved.trim() });

    if (cfg) {
      if (cfg.primary && isM3U8(cfg.primary.url)) {
        list.push({ label: cfg.primary.label || 'Primary', url: cfg.primary.url.trim() });
      }
      (cfg.fallbacks || []).forEach(function (f) {
        if (isM3U8(f.url)) list.push({ label: f.label || 'Fallback', url: f.url.trim() });
      });
    }

    // de-duplicate, keep order
    var seen = {};
    return list.filter(function (s) {
      if (seen[s.url]) return false;
      seen[s.url] = 1; return true;
    });
  }

  /* ── engine ───────────────────────────────────────────────────── */

  var NATIVE = video.canPlayType('application/vnd.apple.mpegurl') !== '';
  var HLSJS  = typeof window.Hls !== 'undefined' && window.Hls.isSupported();

  engineTag.textContent = HLSJS ? 'engine hls.js' : (NATIVE ? 'engine native HLS' : 'engine none');

  function teardown() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
    quality.innerHTML = '<option value="-1">Auto</option>';
    stLevels.textContent = '—';
    stRate.textContent = '—';
  }

  function attach(index, autoplay) {
    if (!sources.length) {
      state('error', 'No stream');
      showPlate('No .m3u8 connected',
        'Paste the Season 2, Episode 7 sneak peek playlist into the source bar below, or set it in metadata/s2e7-stream.json. This player accepts HLS playlists only.',
        'waiting for a playlist', false);
      stSrc.textContent = '—';
      return;
    }
    if (index >= sources.length) {
      state('error', 'All sources failed');
      showPlate('Could not open the playlist',
        'Every configured .m3u8 failed to load. Check the URL, and that the server sends CORS headers for this origin.',
        'hls · manifest error', true);
      return;
    }

    sourceIndex = index;
    var src = sources[index];
    teardown();

    stSrc.textContent = src.label + ' · ' + shortUrl(src.url);
    state('', 'Connecting…');
    showPlate('Opening the playlist', src.label, 'loading ' + shortUrl(src.url), false);

    if (HLSJS) {
      hls = new window.Hls({
        lowLatencyMode: false,
        backBufferLength: 90,
        capLevelToPlayerSize: true,
        enableWorker: true
      });

      hls.on(window.Hls.Events.MANIFEST_PARSED, function (_e, data) {
        var levels = data.levels || [];
        stLevels.textContent = levels.length ? String(levels.length) : '1';
        quality.innerHTML = '<option value="-1">Auto</option>';
        levels.forEach(function (lv, i) {
          var o = document.createElement('option');
          o.value = String(i);
          o.textContent = (lv.height ? lv.height + 'p' : 'level ' + i) +
                          (lv.bitrate ? ' · ' + Math.round(lv.bitrate / 1000) + 'k' : '');
          quality.appendChild(o);
        });
        state('live', 'Connected');
        showPlate('Season 2, Episode 7 — Sneak Peek', 'Playlist connected. Press play.', 'm3u8 · ' + (levels.length || 1) + ' variant(s)', true);
        if (autoplay) play();
      });

      hls.on(window.Hls.Events.LEVEL_SWITCHED, function (_e, data) {
        var lv = hls.levels[data.level];
        if (lv) stRate.textContent = Math.round(lv.bitrate / 1000) + ' kbps' + (lv.height ? ' · ' + lv.height + 'p' : '');
      });

      hls.on(window.Hls.Events.ERROR, function (_e, data) {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && data.details !== 'manifestLoadError') {
          state('error', 'Network hiccup — recovering');
          hls.startLoad();
          return;
        }
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          state('error', 'Media error — recovering');
          hls.recoverMediaError();
          return;
        }
        state('error', 'Source failed — trying next');
        attach(index + 1, autoplay);
      });

      hls.attachMedia(video);
      hls.loadSource(src.url);

    } else if (NATIVE) {
      video.src = src.url;                       // Safari / iOS: native .m3u8
      stLevels.textContent = 'native';
      video.addEventListener('loadedmetadata', function once() {
        video.removeEventListener('loadedmetadata', once);
        state('live', 'Connected');
        showPlate('Season 2, Episode 7 — Sneak Peek', 'Playlist connected. Press play.', 'm3u8 · native HLS', true);
        if (autoplay) play();
      });
      video.addEventListener('error', function once() {
        video.removeEventListener('error', once);
        state('error', 'Source failed — trying next');
        attach(index + 1, autoplay);
      });

    } else {
      state('error', 'No HLS support');
      showPlate('This browser cannot play HLS',
        'hls.js reported no Media Source Extensions support and the browser has no native .m3u8 decoder.',
        'unsupported', false);
    }
  }

  /* ── transport controls ───────────────────────────────────────── */

  function play() {
    var p = video.play();
    if (p && p.catch) {
      p.catch(function () {
        showPlate('Tap to start', 'The browser blocked autoplay with sound. Press play.', 'autoplay blocked', true);
      });
    }
  }

  function toggle() { if (video.paused) play(); else video.pause(); }

  bigPlay.addEventListener('click', function () { hidePlate(); play(); });
  playBtn.addEventListener('click', toggle);
  frame.addEventListener('click', function (e) { if (e.target === video) toggle(); });

  video.addEventListener('playing', function () { hidePlate(); state('live', 'Playing'); playBtn.innerHTML = '&#10073;&#10073;'; });
  video.addEventListener('pause',  function () { state('live', 'Paused'); playBtn.innerHTML = '&#9654;'; });
  video.addEventListener('waiting', function () { state('', 'Buffering…'); });
  video.addEventListener('ended',  function () {
    playBtn.innerHTML = '&#9654;';
    showPlate('That’s the peek', 'Season 2, Episode 7 — Love & Hip Hop: New York.', 'replay', true);
  });

  video.addEventListener('loadedmetadata', function () { tEnd.textContent = clock(video.duration); });
  video.addEventListener('durationchange', function () { tEnd.textContent = clock(video.duration); });

  video.addEventListener('timeupdate', function () {
    tNow.textContent = clock(video.currentTime);
    if (!scrubbing && isFinite(video.duration) && video.duration > 0) {
      var pct = (video.currentTime / video.duration) * 1000;
      scrub.value = String(pct);
      paintScrub(pct / 10);
    }
    if (video.buffered.length) {
      var end = video.buffered.end(video.buffered.length - 1);
      stBuf.textContent = Math.max(0, end - video.currentTime).toFixed(1) + ' s';
    }
  });

  function paintScrub(pct) {
    scrub.style.background =
      'linear-gradient(90deg,var(--gold) 0%,var(--gold) ' + pct + '%,#34343c ' + pct + '%,#34343c 100%)';
  }
  paintScrub(0);

  scrub.addEventListener('input', function () {
    scrubbing = true;
    paintScrub(Number(scrub.value) / 10);
    if (isFinite(video.duration)) tNow.textContent = clock((Number(scrub.value) / 1000) * video.duration);
  });
  scrub.addEventListener('change', function () {
    if (isFinite(video.duration)) video.currentTime = (Number(scrub.value) / 1000) * video.duration;
    scrubbing = false;
  });

  muteBtn.addEventListener('click', function () {
    video.muted = !video.muted;
    muteBtn.setAttribute('aria-pressed', String(video.muted));
    muteBtn.innerHTML = video.muted ? '&#128263;' : '&#128266;';
  });

  vol.addEventListener('input', function () {
    video.volume = Number(vol.value) / 100;
    if (video.volume > 0 && video.muted) {
      video.muted = false;
      muteBtn.setAttribute('aria-pressed', 'false');
      muteBtn.innerHTML = '&#128266;';
    }
  });

  quality.addEventListener('change', function () {
    if (!hls) return;
    hls.currentLevel = Number(quality.value);
    if (Number(quality.value) === -1) stRate.textContent = 'auto';
  });

  fsBtn.addEventListener('click', function () {
    var shell = document.querySelector('.player-shell');
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (shell.requestFullscreen) shell.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  });

  document.addEventListener('keydown', function (e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') video.currentTime += 10;
    else if (e.key === 'ArrowLeft')  video.currentTime -= 10;
    else if (e.key === 'm') muteBtn.click();
    else if (e.key === 'f') fsBtn.click();
  });

  /* ── source bar ───────────────────────────────────────────────── */

  loadBtn.addEventListener('click', function () {
    var url = srcInput.value.trim();
    if (!url) return;
    if (!isM3U8(url)) {
      state('error', 'Not an .m3u8 — rejected');
      showPlate('HLS only', 'That is not an .m3u8 playlist. This player does not accept mp4 or any other progressive file.', 'rejected', false);
      return;
    }
    try { localStorage.setItem(LS_KEY, url); } catch (e) {}
    sources = [{ label: 'Your stream', url: url }].concat(
      sources.filter(function (s) { return s.url !== url; })
    );
    attach(0, true);
  });

  srcInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadBtn.click(); });

  resetBtn.addEventListener('click', function () {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    srcInput.value = '';
    boot(false);
  });

  /* ── chapters ─────────────────────────────────────────────────── */

  function renderChapters(data) {
    var list = $('chapterList');
    var chs = (data && data.chapters) || [];
    if (!chs.length) return;
    list.innerHTML = '';
    chs.forEach(function (c) {
      var li = document.createElement('li');
      var lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = c.label || '';
      var note = document.createElement('span');
      note.className = 'note';
      note.textContent = c.note || '';
      lbl.appendChild(note);
      li.appendChild(lbl);
      list.appendChild(li);
    });
  }

  /* ── boot ─────────────────────────────────────────────────────── */

  function boot(autoplay) {
    state('', 'Reading stream config…');
    getJSON(CONFIG_URLS).then(function (cfg) {
      sources = buildSources(cfg);
      try {
        var saved = localStorage.getItem(LS_KEY);
        if (isM3U8(saved)) srcInput.value = saved;
      } catch (e) {}
      attach(0, !!autoplay);
    });
  }

  getJSON(DATA_URLS).then(renderChapters);
  boot(false);

})();
