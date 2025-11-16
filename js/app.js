import { createVideoItem } from "./ui.js";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const resultsDiv = document.getElementById("results");

const playerSection = document.getElementById("playerSection");
const player = document.getElementById("player");
const playPauseBtn = document.getElementById("playPauseBtn");

const pipBtn = document.getElementById("pipBtn");
const darkToggle = document.getElementById("darkToggle");
const sleepSelect = document.getElementById("sleepSelect");
const openExternal = document.getElementById("openExternal");

const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const instanceInput = document.getElementById("instanceInput");
const saveSettings = document.getElementById("saveSettings");

// STATE
let INSTANCE = localStorage.getItem("instance") || "https://piped.video";
let sleepTimer = null;

// ----------------------------
// SEARCH
// ----------------------------
async function search() {
  const q = searchInput.value.trim();
  if (!q) return;

  resultsDiv.innerHTML = "Searching…";

  const url = `${INSTANCE}/api/v1/search?q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    resultsDiv.innerHTML = "";

    data.items.forEach(v => {
      if (!v.thumbnail) return;
      const item = createVideoItem(
        {
          title: v.title,
          thumbnail: v.thumbnail,
          uploader: v.uploaderName,
          id: v.id
        },
        selectVideo
      );
      resultsDiv.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = "Failed. Try another instance.";
  }
}

searchBtn.onclick = search;

// ----------------------------
// PLAY VIDEO
// ----------------------------
async function selectVideo(video) {
  playerSection.classList.remove("hidden");

  const watchUrl = `${INSTANCE}/api/v1/videos/${video.id}`;

  try {
    const res = await fetch(watchUrl);
    const data = await res.json();

    const stream = data.videoStreams?.find(s => s.quality === "720p") ||
                   data.videoStreams?.[0];

    if (!stream) {
      alert("Stream blocked by CORS. Try Open in Piped.");
      return;
    }

    player.src = stream.url;
    player.play();

    openExternal.onclick = () =>
      window.open(`${INSTANCE}/watch?v=${video.id}`, "_blank");

  } catch(err) {
    console.error(err);
    alert("Cannot play video.");
  }
}

// ----------------------------
// PLAY/PAUSE
// ----------------------------
playPauseBtn.onclick = () => {
  if (player.paused) {
    player.play();
    playPauseBtn.textContent = "Pause";
  } else {
    player.pause();
    playPauseBtn.textContent = "Play";
  }
};

// ----------------------------
// PICTURE-IN-PICTURE
// ----------------------------
pipBtn.onclick = async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await player.requestPictureInPicture();
    }
  } catch (err) {
    alert("PiP not supported");
  }
};

// ----------------------------
// DARK MODE
// ----------------------------
darkToggle.onclick = () => {
  document.body.classList.toggle("dark");

  localStorage.setItem(
    "darkMode",
    document.body.classList.contains("dark") ? "1" : "0"
  );
};

if (localStorage.getItem("darkMode") === "1") {
  document.body.classList.add("dark");
}

// ----------------------------
// SLEEP TIMER
// ----------------------------
sleepSelect.onchange = () => {
  if (sleepTimer) clearTimeout(sleepTimer);

  const mins = Number(sleepSelect.value);
  if (mins === 0) return;

  sleepTimer = setTimeout(() => {
    player.pause();
    alert("Sleep timer ended.");
  }, mins * 60 * 1000);
};

// ----------------------------
// SETTINGS
// ----------------------------
settingsBtn.onclick = () => {
  settingsPanel.classList.toggle("hidden");
};

saveSettings.onclick = () => {
  INSTANCE = instanceInput.value.trim();
  localStorage.setItem("instance", INSTANCE);
  settingsPanel.classList.add("hidden");
};
