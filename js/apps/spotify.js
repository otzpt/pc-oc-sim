// Spotify embed player. Full playback needs the viewer to be logged in to
// Spotify in this browser; otherwise the embed plays 30 s previews.
const parse = s => {
  const m = s.trim().match(/open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist|artist|episode|show)\/(\w+)/);
  if (m) return `${m[1]}/${m[2]}`;
  const u = s.trim().match(/^spotify:(track|album|playlist|artist|episode|show):(\w+)$/);
  return u ? `${u[1]}/${u[2]}` : null;
};

export default {
  id: 'spotify', title: 'Spotify', icon: 'ti-brand-spotify', color: '#1db954', w: 520, h: 560,
  mount(body) {
    body.innerHTML = `
      <div class="app-row" style="padding:6px">
        <input class="sp-in" style="flex:1" placeholder="Paste a Spotify link (track, album, playlist)" aria-label="Spotify link">
        <button data-sp="go">Open</button>
      </div>
      <div class="iframe-wrap" style="background:#121212"><iframe title="Spotify player" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe></div>
      <div class="notice msg" hidden></div>`;
    const frame = body.querySelector('iframe');
    const msg = body.querySelector('.msg');
    const open = path => {
      if (!path) { msg.hidden = false; msg.textContent = 'Paste a link like https://open.spotify.com/playlist/...'; return; }
      msg.hidden = true;
      frame.src = `https://open.spotify.com/embed/${path}?utm_source=generator&theme=0`;
    };
    body.addEventListener('click', e => { if (e.target.closest('[data-sp]')) open(parse(body.querySelector('.sp-in').value)); });
    body.querySelector('.sp-in').addEventListener('keydown', e => { if (e.key === 'Enter') open(parse(e.target.value)); });
    open('playlist/37i9dQZF1DXcBWIGoYBM5M');
  },
};
