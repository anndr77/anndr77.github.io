// register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(()=>console.log('SW registered'))
    .catch(err=>console.warn('SW failed', err));
}

const actionsBtn = document.getElementById('actionsBtn');
const actionsMenu = document.getElementById('actionsMenu');
const openExternal = document.getElementById('openExternal');
const saveLink = document.getElementById('saveLink');
const downloadHelp = document.getElementById('downloadHelp');
const settingsBtn = document.getElementById('settingsBtn');
const settings = document.getElementById('settings');
const closeSettings = document.getElementById('closeSettings');
const layoutSelect = document.getElementById('layoutSelect');

actionsBtn.addEventListener('click', ()=> actionsMenu.classList.toggle('hidden'));
openExternal.addEventListener('click', ()=> {
  const frame = document.getElementById('ytFrame');
  const src = frame.src;
  window.open(src, '_blank'); // open in external browser tab
});
saveLink.addEventListener('click', ()=> {
  const url = document.getElementById('ytFrame').src;
  // Simple save to localStorage playlist
  let saved = JSON.parse(localStorage.getItem('savedLinks')||'[]');
  saved.push({url, at:new Date().toISOString()});
  localStorage.setItem('savedLinks', JSON.stringify(saved));
  alert('Link saved locally.');
});
downloadHelp.addEventListener('click', ()=> {
  alert('I cannot help build tools that bypass YouTube protections. You can use YouTube Premium, or open the video in browser and use official options.');
});

settingsBtn.addEventListener('click', ()=> settings.classList.remove('hidden'));
closeSettings.addEventListener('click', ()=> settings.classList.add('hidden'));

// layout switch
layoutSelect.addEventListener('change', (e)=>{
  document.body.classList.remove('layout-iphone','layout-ipad','layout-mac');
  document.body.classList.add('layout-'+e.target.value);
  localStorage.setItem('preferredLayout', e.target.value);
});
// set initial
const pref = localStorage.getItem('preferredLayout') || 'iphone';
layoutSelect.value = pref;
document.body.classList.add('layout-'+pref);
