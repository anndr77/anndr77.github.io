/* Video Lite — Piped frontend (client-only PWA)
   Notes:
   - Default instance: https://piped.video
   - We try API endpoints (search + video details) and attempt to use direct stream URLs.
   - If direct stream blocked by CORS, we fall back to opening the instance watch page in an iframe (if allowed) or external tab.
   - We persist settings, playlist, last played in localStorage.
*/

const DEFAULT_INSTANCE = localStorage.getItem('instanceBase') || 'https://piped.video';

const ui = {
  searchInput: document.getElementById('searchInput'),
  resultsList: document.getElementById('resultsList'),
  resultsInfo: document.getElementById('resultsInfo'),
  player: document.getElementById('player'),
  instanceFrame: document.getElementById('instanceFrame'),
  iframeWrapper: document.getElementById('iframeWrapper'),
  videoMeta: document.getElementById('videoMeta'),
  videoTitle: document.getElementById('videoTitle'),
  videoAuthor: document.getElementById('videoAuthor'),
  videoThumb: document.getElementById('videoThumb'),
  saveBtn: document.getElementById('saveBtn'),
  addToPlaylistBtn: document.getElementById('addToPlaylistBtn'),
  downloadHelpBtn: document.getElementById('downloadHelpBtn'),
  resultsSection: document.getElementById('resultsSection'),
  playlistList: document.getElementById('playlistList'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  openExternalBtn: document.getElementById('openExternalBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settings'),
  instanceUrlInput: document.getElementById('instanceUrl'),
  saveSettings: document.getElementById('saveSettings'),
  closeSettings: document.getElementById('closeSettings'),
  layoutSelect: document.getElementById('layoutSelect'),
  clearPlaylistBtn: document.getElementById('clearPlaylist')
};

let instanceBase = localStorage.getItem('instanceBase') || DEFAULT_INSTANCE;
ui.instanceUrlInput.value = instanceBase;

let playlist = JSON.parse(localStorage.getItem('playlist') || '[]');
let lastPlayed = JSON.parse(localStorage.getItem('lastPlayed') || 'null');

async function registerSW(){
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
      console.log('SW registered');
    } catch(e) {
      console.warn('SW failed', e);
    }
  }
}
registerSW();

// --- Helper: try multiple endpoints until success
async function tryFetchAny(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        return {url, json, res};
      } else {
        // return raw text if not json
        const text = await res.text();
        return {url, text, res};
      }
    } catch(e){
      // try next
    }
  }
  throw new Error('All endpoints failed');
}

// --- Search
async function apiSearch(query){
  const q = encodeURIComponent(query);
  const candidates = [
    `${instanceBase.replace(/\/$/,'')}/api/v1/search?q=${q}`,
    `${instanceBase.replace(/\/$/,'')}/search?q=${q}`,
    // legacy/other attempts:
    `${instanceBase.replace(/\/$/,'')}/api/v1/search?query=${q}`
  ];
  return tryFetchAny(candidates);
}

function normalizeSearch(json){
  if (!json) return [];
  if (Array.isArray(json)) {
    return json.map(i => {
      const id = i.videoId || i.id || (i.video && i.video.videoId) || null;
      const title = i.title || i.name || i.video?.title || '';
      const author = i.author || i.authorName || i.video?.author || '';
      const thumb = i.thumbnail || i.thumbnail?.url || i.video?.thumbnails?.[0]?.url || i.thumb;
      return {id, title, author, thumb};
    }).filter(x=>x.id);
  }
  // piped returns object with videos property sometimes
  if (json.videos) {
    return (json.videos||[]).map(v => ({id:v.videoId||v.id, title:v.title, author:v.author?.name||v.author, thumb:v.thumbnail}));
  }
  return [];
}

function renderResults(items){
  ui.resultsList.innerHTML = '';
  if (!items.length) {
    ui.resultsList.innerHTML = '<li style="padding:12px;color:#999">No results</li>'; return;
  }
  items.forEach(item=>{
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.className = 'thumbSmall';
    img.src = item.thumb || '';
    img.alt = item.title || '';
    li.appendChild(img);
    const meta = document.createElement('div');
    meta.style.flex='1';
    meta.innerHTML = `<div style="font-weight:600">${escapeHtml(item.title)}</div><div style="font-size:0.9rem;color:${'#666'}">${escapeHtml(item.author||'')}</div>`;
    li.appendChild(meta);
    li.addEventListener('click', ()=> openVideo(item.id, item));
    ui.resultsList.appendChild(li);
  });
}

// Escape helper
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }

// --- Get video details (Piped exposes a video endpoint)
async function getVideoDetails(videoId){
  const candidates = [
    `${instanceBase.replace(/\/$/,'')}/api/v1/videos/${videoId}`,
    `${instanceBase.replace(/\/$/,'')}/api/v1/video?id=${videoId}`,
    `${instanceBase.replace(/\/$/,'')}/api/v1/videos?videoId=${videoId}`
  ];
  return tryFetchAny(candidates);
}

// --- Playback logic: try to set direct stream; if blocked, fallback
async function openVideo(id, meta = {}){
  console.log('openVideo', id);
  // clear UI state
  ui.iframeWrapper.classList.add('hidden');
  ui.player.classList.remove('hidden');
  // update meta
  ui.videoTitle.textContent = meta.title || '';
  ui.videoAuthor.textContent = meta.author || '';
  if (meta.thumb) { ui.videoThumb.src = meta.thumb; ui.videoMeta.classList.remove('hidden'); }
  else ui.videoMeta.classList.add('hidden');

  try {
    const {url, json} = await getVideoDetails(id);
    // Attempt to locate an audio/video stream
    // Piped returns fields: videoStreams and audioStreams (or streams)
    const v = json;
    // try multiple places
    const videoStreams = v.videoStreams || v.video_streams || v.streams || (v.streams || []).filter(s=>s.type?.startsWith('video'));
    const audioStreams = v.audioStreams || v.audio_streams || (v.streams || []).filter(s=>s.type?.startsWith('audio'));
    // pick a playable url
    let streamUrl = null;
    if (videoStreams && videoStreams.length) streamUrl = videoStreams[0].url || videoStreams[0].urlWithSignature || null;
    if (!streamUrl && audioStreams && audioStreams.length) streamUrl = audioStreams[0].url || null;

    if (!streamUrl) {
      console.log('No direct stream found, falling back to watch page');
      return fallbackToWatchPage(id);
    }

    // Try to set <video> src and play
    ui.player.src = streamUrl;
    try { await ui.player.play(); ui.playPauseBtn.textContent = 'Pause'; }
    catch(e) { console.warn('Autoplay blocked or other error', e); ui.playPauseBtn.textContent = 'Play'; }

    // remember lastPlayed
    lastPlayed = {id, meta, streamUrl, at: new Date().toISOString()};
    localStorage.setItem('lastPlayed', JSON.stringify(lastPlayed));
    // ask SW to cache metadata (not the video stream)
    try { navigator.serviceWorker.controller?.postMessage({type:'cache-url', url}); } catch(e){}

    // Note: streaming may fail due to CORS; if the video errors, fall back to watch page
    ui.player.onstalled = ui.player.onerror = () => {
      console.warn('Player stalled or error; falling back to watch page');
      fallbackToWatchPage(id);
    };
  } catch(err) {
    console.warn('video detail fetch failed', err);
    fallbackToWatchPage(id);
  }
}

function fallbackToWatchPage(id){
  const watchUrl = `${instanceBase.replace(/\/$/,'')}/watch?v=${encodeURIComponent(id)}`;
  // Some instances disallow embedding; try iframe first
  ui.instanceFrame.src = watchUrl;
  ui.iframeWrapper.classList.remove('hidden');
  ui.player.src = '';
  // if iframe fails (CSP), open externally
  setTimeout(()=> {
    // try to detect if iframe loaded by checking contentWindow (could be limited)
    try {
      const cw = ui.instanceFrame.contentWindow;
      // if cross-origin, we cannot check, so assume iframe is the best effort
    } catch(e) {
      // cross-origin check error; do nothing
    }
  }, 1200);
}

// --- Playlist management
function renderPlaylist(){
  ui.playlistList.innerHTML = '';
  if (!playlist.length) { ui.playlistList.innerHTML = '<li style="color:#999;padding:10px">No saved items</li>'; return; }
  playlist.forEach((p, idx)=>{
    const li = document.createElement('li');
    li.style.display='flex'; li.style.justifyContent='space-between'; li.style.alignItems='center'; li.style.padding='8px';
    li.innerHTML = `<div style="flex:1"><div style="font-weight:600">${escapeHtml(p.meta?.title||p.id)}</div><div style="font-size:.85rem;color:#666">${escapeHtml(p.meta?.author||'')}</div></div>`;
    const playBtn = document.createElement('button'); playBtn.textContent='▶'; playBtn.className='mini';
    playBtn.addEventListener('click', ()=> openVideo(p.id, p.meta));
    const remBtn = document.createElement('button'); remBtn.textContent='✕'; remBtn.className='mini';
    remBtn.addEventListener('click', ()=> {
      playlist.splice(idx,1); localStorage.setItem('playlist', JSON.stringify(playlist)); renderPlaylist();
    });
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='6px'; right.appendChild(playBtn); right.appendChild(remBtn);
    li.appendChild(right);
    ui.playlistList.appendChild(li);
  });
}

// --- UI wiring
ui.searchInput.addEventListener('keydown', e=>{
  if (e.key === 'Enter') performSearch(e.target.value.trim());
});

async function performSearch(q){
  if (!q) return;
  ui.resultsList.innerHTML = '<li style="padding:12px;color:#666">Searching…</li>';
  try {
    const {url, json} = await apiSearch(q);
    const items = normalizeSearch(json);
    ui.resultsInfo.textContent = `via ${new URL(url).hostname}`;
    renderResults(items);
    // cache search url (metadata) via SW
    try { navigator.serviceWorker.controller?.postMessage({type:'cache-url', url}); } catch(e){}
  } catch(err) {
    ui.resultsList.innerHTML = `<li style="padding:12px;color:crimson">Search failed: ${err.message}</li>`;
  }
}

ui.saveBtn.addEventListener('click', ()=> {
  if (!lastPlayed || !lastPlayed.id) return alert('No video playing');
  const id = lastPlayed.id;
  if (!playlist.find(p=>p.id===id)) {
    playlist.push({id, meta:lastPlayed.meta||{}, savedAt:new Date().toISOString()});
    localStorage.setItem('playlist', JSON.stringify(playlist));
    renderPlaylist();
    alert('Saved to playlist');
  } else alert('Already in playlist');
});

ui.addToPlaylistBtn.addEventListener('click', ()=>{
  ui.saveBtn.click();
});

ui.downloadHelpBtn.addEventListener('click', ()=>{
  alert('Download and conversions are not included. Options:\n\n• Use YouTube / Piped official features or YouTube Premium.\n• Add your own local audio files to this app (fully legal) and they will be cached for offline use.\n• Self-host a Piped/Invidious instance with CORS configuration to support direct streams (advanced).');
});

ui.playPauseBtn.addEventListener('click', ()=>{
  if (ui.player.paused) { ui.player.play(); ui.playPauseBtn.textContent='Pause'; }
  else { ui.player.pause(); ui.playPauseBtn.textContent='Play'; }
});

ui.prevBtn.addEventListener('click', ()=> {
  const idx = playlist.findIndex(p=>p.id===lastPlayed?.id);
  if (idx > 0) openVideo(playlist[idx-1].id, playlist[idx-1].meta);
  else alert('No previous');
});
ui.nextBtn.addEventListener('click', ()=> {
  const idx = playlist.findIndex(p=>p.id===lastPlayed?.id);
  if (idx >= 0 && idx < playlist.length-1) openVideo(playlist[idx+1].id, playlist[idx+1].meta);
  else alert('No next in playlist');
});

ui.openExternalBtn.addEventListener('click', ()=>{
  if (!lastPlayed) return alert('No video');
  const watchUrl = `${instanceBase.replace(/\/$/,'')}/watch?v=${encodeURIComponent(lastPlayed.id)}`;
  window.open(watchUrl, '_blank');
});

ui.settingsBtn.addEventListener('click', ()=> {
  ui.settingsModal.classList.remove('hidden');
  ui.instanceUrlInput.value = instanceBase;
  ui.layoutSelect.value = localStorage.getItem('preferredLayout') || 'iphone';
});

ui.closeSettings.addEventListener('click', ()=> ui.settingsModal.classList.add('hidden'));
ui.saveSettings.addEventListener('click', ()=> {
  instanceBase = (ui.instanceUrlInput.value || DEFAULT_INSTANCE).trim();
  localStorage.setItem('instanceBase', instanceBase);
  const layout = ui.layoutSelect.value || 'iphone';
  document.body.classList.remove('layout-iphone','layout-ipad','layout-mac');
  document.body.classList.add('layout-'+layout);
  localStorage.setItem('preferredLayout', layout);
  ui.settingsModal.classList.add('hidden');
  alert('Settings saved. If playback fails for some videos, try another instance.');
});

ui.clearPlaylistBtn.addEventListener('click', ()=> {
  if (confirm('Clear playlist?')) {
    playlist = []; localStorage.removeItem('playlist'); renderPlaylist();
  }
});

// initial render
renderPlaylist();
if (lastPlayed && lastPlayed.id) {
  openVideo(lastPlayed.id, lastPlayed.meta);
}

// small visual helpers
function normalizeSearch(json){
  if (!json) return [];
  if (Array.isArray(json)) return json.map(i=>({ id:i.videoId||i.id, title:i.title||i.name, author:i.author||i.author?.name, thumb:i.thumbnail || i.thumbnail?.url })).filter(x=>x.id);
  if (json.videos) return (json.videos||[]).map(v=>({id:v.videoId||v.id, title:v.title, author:v.author?.name||v.author, thumb:v.thumbnail}));
  // fallback: maybe it's object with items
  if (json.items) return (json.items||[]).map(i=>({id:i.id, title:i.title||i.snippet?.title, author:i.author||i.snippet?.channelTitle, thumb:i.thumbnail}));
  return [];
}
