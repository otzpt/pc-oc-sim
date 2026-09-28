// Internet browser. Many sites refuse to load inside a frame (X-Frame-Options /
// CSP frame-ancestors); the page cannot detect that, so it offers a real-tab link.
const HOME = `<!doctype html><meta charset="utf-8"><body style="font:14px 'Segoe UI','Noto Sans',sans-serif;margin:0;padding:32px 40px;background:#f4f7fb;color:#1e395b">
<h1 style="font-weight:400;margin:0 0 8px">VOID 7 Internet</h1>
<p style="margin:0 0 24px;color:#4a6280">Type an address above. Sites that block embedding show a blank or refused page; use "Open in real tab" for those.</p>
<h3 style="font-weight:600">Try</h3>
<ul style="line-height:2">
<li>https://en.m.wikipedia.org/wiki/Zen_3</li>
<li>https://en.m.wikipedia.org/wiki/Overclocking</li>
<li>https://example.com</li>
</ul></body>`;

export default {
  id: 'browser', title: 'Internet', icon: 'ti-world-www', color: '#2b8be6', w: 900, h: 560,
  mount(body) {
    body.innerHTML = `
      <div class="app-row" style="padding:6px">
        <button data-b="back" title="Back"><i class="ti ti-arrow-left"></i></button>
        <button data-b="fwd" title="Forward"><i class="ti ti-arrow-right"></i></button>
        <button data-b="home" title="Home"><i class="ti ti-home"></i></button>
        <input class="url" style="flex:1" value="about:home" aria-label="Address">
        <button data-b="go">Go</button>
        <a class="real" target="_blank" rel="noopener" href="#" hidden>Open in real tab</a>
      </div>
      <div class="iframe-wrap"><iframe title="Page" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>`;
    const frame = body.querySelector('iframe');
    const url = body.querySelector('.url');
    const real = body.querySelector('.real');
    const hist = [];
    let pos = -1;
    const show = u => {
      url.value = u;
      if (u === 'about:home') { frame.removeAttribute('src'); frame.srcdoc = HOME; real.hidden = true; return; }
      frame.removeAttribute('srcdoc');
      frame.src = u;
      real.href = u; real.hidden = false;
    };
    const go = raw => {
      let u = raw.trim();
      if (!u) return;
      if (u !== 'about:home' && !/^https?:\/\//i.test(u)) u = u.includes('.') && !u.includes(' ') ? `https://${u}` : `https://duckduckgo.com/html/?q=${encodeURIComponent(u)}`;
      hist.splice(pos + 1); hist.push(u); pos = hist.length - 1;
      show(u);
    };
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-b]')?.dataset.b;
      if (b === 'go') go(url.value);
      if (b === 'home') go('about:home');
      if (b === 'back' && pos > 0) show(hist[--pos]);
      if (b === 'fwd' && pos < hist.length - 1) show(hist[++pos]);
    });
    url.addEventListener('keydown', e => { if (e.key === 'Enter') go(url.value); });
    go('about:home');
  },
};
