// YouTube via the privacy-enhanced embed player. Search needs an API key, so
// the app takes a link or video ID instead.
const parseId = s => {
  s = s.trim();
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : null;
};
// Quick picks. Each one was loaded in the embed player on 2026-09-28 and did not
// show "This video is unavailable" (some videos block embeds; those need Watch on YouTube).
// [video id, button label, full title (channel)]
const PICKS = [
  ['HGvi8G07Tjk', '1155 do ET: OC', 'FIZ OVERCLOCK NA LGA1155 ATÉ A CPU CRIAR CONSCIÊNCIA PRÓPRIA (1155 do ET)'],
  ['VsLGHrdbjTI', '1155 do ET: fita isolante', 'O DIA QUE O 1155 DO ET FEZ OVERCLOCK COM UMA FITA ISOLANTE (1155 DO ET - SHORTS)'],
  ['DBGgi5Lqn0U', 'Terry A. Davis: TempleOS', 'Terry A Davis: Homeless And Hunting Bugs In TempleOS (Cactus)'],
  ['t9l058vrURo', 'Bisqwit: TempleOS', 'Bisqwit analyses TempleOS & its sole author, Terry A. Davis (Bisqwit)'],
];

export default {
  id: 'youtube', title: 'YouTube', icon: 'ti-brand-youtube', color: '#ff2a2a', w: 820, h: 560,
  mount(body) {
    body.innerHTML = `
      <div class="app-row" style="padding:6px">
        <input class="yt-in" style="flex:1" placeholder="Paste a YouTube link or video ID" aria-label="YouTube link">
        <button data-yt="play">Play</button>
        ${PICKS.map(([id, label, title]) => `<button data-pick="${id}" title="${title}">${label}</button>`).join('')}
      </div>
      <div class="iframe-wrap"><iframe title="YouTube player" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="notice msg" hidden></div>`;
    const frame = body.querySelector('iframe');
    const msg = body.querySelector('.msg');
    const play = id => {
      if (!id) { msg.hidden = false; msg.textContent = 'That does not look like a YouTube link or 11-character video ID.'; return; }
      msg.hidden = true;
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    };
    body.addEventListener('click', e => {
      if (e.target.closest('[data-yt]')) play(parseId(body.querySelector('.yt-in').value));
      const p = e.target.closest('[data-pick]');
      if (p) play(p.dataset.pick);
    });
    body.querySelector('.yt-in').addEventListener('keydown', e => { if (e.key === 'Enter') play(parseId(e.target.value)); });
    play(PICKS[0][0]);
  },
};
