// Minimal privacy-frontend PWA controller
const DEFAULT_INSTANCE = localStorage.getItem('instanceBase') || 'https://yewtu.eu'; // example invidious
const instanceUrlInput = document.getElementById('instanceUrl');
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('resultsList');
const instanceFrame = document.getElementById('instanceFrame');
const videoTitle = document.getElementById('videoTitle');
const videoAuthor = document.getElementById('videoAuthor');
const videoMeta = document.getElementById('videoMeta');

let instanceBase = localStorage.getItem('instanceBase') || DEFAULT_INSTANCE;
instanceUrlInput.value = instanceBase;

// register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(()=>console.log('SW registered'))
    .catch(err=>console.warn('SW failed', err));
}

// helpers
function apiSearch(query) {
  // Try Invidious API first (common endpoint)
  // Invidious: /api/v1/search?q=...  Piped: /search?q=... (some instances use different URLs)
  // We'll attempt Invidious style first
  const enc = encodeURIComponent(query);
  const urlsToTry = [
    `${instanceBase}/api/v1/search?q=${enc}`,
    `${instanceBase}/search?q=${enc}`
  ];
  return tryFetchAny(urlsToTry);
}

function tryFetchAny(urls) {
  // try each URL until one returns json
  return new Promise(async (resolve, reject) => {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        return resolve({url, json});
      } catch (e) {
        // try next
      }
    }
    reject(new Error('All instance endpoints failed.'));
  });
}

async function doSearch(q) {
  if (!q) return;
  resultsList.innerHTML = '<li>Searching…</li>';
  try {
    const {url, json} = await apiSearch(q);
    // Invidious returns array of results; Piped returns structure; we'll try to normalize
    const items = normalizeSearchResults(json);
    renderResults(items);
    // Ask SW to cache this search URL for offline metadata (optional)
    try { navigator.serviceWorker.controller?.postMessage({type:'cache-url', url}); } catch(e){}
  } catch (err) {
    resultsList.innerHTML = `<li style="color:crimson">Search failed: ${err.message}</li>`;
  }
}

function normalizeSearchResults(json) {
  // json could be array of videos or object. We'll map to {id,title,author,thumb}
  if (!json) return [];
  // If array of objects with 'videoId' or 'id' fields:
  if (Array.isArray(json)) {
    return json.map(i => {
      const id = i.videoId || i.id || (i.video && i.video.videoId) || null;
      const title = i.title || i.videoTitle || i.name || (i.video && i.video.title) || '';
      const author = i.author || i.videoAuthor || (i.video && i.video.author) || '';
      const thumb = i.thumbnail || i.video?.thumbnails?.[0]?.url || i.thumb;
      return {id, title, author, thumb};
    }).filter(x=>x.id);
  }
  // If object with 'videos' array (Piped style)
  if (json.videos) {
    return (json.videos||[]).map(v => ({id:v.videoId || v.id, title:v.title, author:v.author?.name || v.author, thumb:v.thumbnail}));
  }
  return [];
}

function renderResults(items) {
  if (!items.length) { resultsList.innerHTML = '<li>No results</li>'; return; }
  resultsList.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.textContent = it.title + (it.author ? ` — ${it.author}` : '');
    li.dataset.id = it.id;
    li.addEventListener('click', ()=> openVideo(it.id, it));
    resultsList.appendChild(li);
  }
}

function openVideo(id, meta) {
  // Compose instance watch URL (Invidious style /watch?v=ID)
  const watchUrl = `${instanceBase.replace(/\/$/,'')}/watch?v=${id}`;
  instanceFrame.src = watchUrl;
  if (meta) {
    videoTitle.textContent = meta.title || '';
    videoAuthor.textContent = meta.author || '';
    videoMeta.classList.remove('hidden');
  } else {
    videoMeta.classList.add('hidden');
  }
  // store last opened
  localStorage.setItem('lastVideo', JSON.stringify({id, meta, watchUrl, at:new Date().toISOString()}));
}

function saveCurrentToPlaylist() {
  const last = JSON.parse(localStorage.getItem('lastVideo')||'null');
  if (!last || !last.id) { alert('No video open'); return; }
  const list = JSON.parse(localStorage.getItem('playlist')||'[]');
  if (list.find(x=>x.id===last.id)) { alert('Already in playlist'); return; }
  list.push(last);
  localStorage.setItem('playlist', JSON.stringify(list));
  alert('Saved to playlist (local).');
  // ask SW to cache the watchUrl metadata (not the video)
  try { navigator.serviceWorker.controller?.postMessage({type:'cache-url', url:last.watchUrl}); } catch(e){}
}

// UI wiring
document.getElementById('searchInput').addEventListener('keydown', e=>{
  if (e.key === 'Enter') doSearch(e.target.value.trim());
});

document.getElementById('settingsBtn').addEventListener('click', ()=> {
  document.getElementById('settings').classList.remove('hidden');
  instanceUrlInput.value = instanceBase;
});

document.getElementById('closeSettings').addEventListener('click', ()=> document.getElementById('settings').classList.add('hidden'));
document.getElementById('saveSettings').addEventListener('click', ()=> {
  instanceBase = (instanceUrlInput.value || DEFAULT_INSTANCE).trim();
  localStorage.setItem('instanceBase', instanceBase);
  alert('Saved instance: ' + instanceBase);
});

// footer actions
document.getElementById('actionsBtn').addEventListener('click', ()=> document.getElementById('actionsMenu').classList.toggle('hidden'));
document.getElementById('saveLink').addEventListener('click', saveCurrentToPlaylist);
document.getElementById('openExternal').addEventListener('click', ()=>{
  const last = JSON.parse(localStorage.getItem('lastVideo')||'null');
  if (!last) return alert('No video open');
  window.open(last.watchUrl, '_blank');
});
document.getElementById('downloadHelp').addEventListener('click', ()=>{
  alert('I cannot build unauthorized downloaders. Options:\n\n• Use YouTube Premium official downloads (on device).\n• Use authorized APIs for content you own.\n• Add your own local audio files to the app and they will be cacheable for offline playback.');
});

// playlist button opens simple list
document.getElementById('playlistBtn').addEventListener('click', ()=> {
  const pl = JSON.parse(localStorage.getItem('playlist')||'[]');
  if (!pl.length) return alert('Playlist empty');
  const list = pl.map((p,i)=>`${i+1}. ${p.meta?.title || p.id}`).join('\n');
  alert('Saved playlist:\n\n' + list);
});

// layout select restore
const pref = localStorage.getItem('preferredLayout') || 'iphone';
document.getElementById('layoutSelect').value = pref;
document.body.classList.add('layout-'+pref);
document.getElementById('layoutSelect').addEventListener('change', e=>{
  document.body.classList.remove('layout-iphone','layout-ipad','layout-mac');
  document.body.classList.add('layout-'+e.target.value);
  localStorage.setItem('preferredLayout', e.target.value);
});

// load last video if any
const last = JSON.parse(localStorage.getItem('lastVideo')||'null');
if (last && last.watchUrl) {
  instanceFrame.src = last.watchUrl;
  videoTitle.textContent = last.meta?.title || '';
  videoAuthor.textContent = last.meta?.author || '';
  videoMeta.classList.remove('hidden');
}
