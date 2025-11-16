// Small helper module

export function createVideoItem(video, clickHandler) {
  const div = document.createElement("div");
  div.className = "videoItem";

  div.innerHTML = `
    <img src="${video.thumbnail}" />
    <h3>${video.title}</h3>
    <p>${video.uploader}</p>
  `;

  div.onclick = () => clickHandler(video);
  return div;
}
