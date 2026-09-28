// Four-point Smart Fan curve editor (temperature -> duty), like Click BIOS 5.
// Redraws itself while dragging and calls onChange once on release.
const W = 460, H = 240, PAD = 34;
const tx = t => PAD + (t - 20) / 80 * (W - PAD * 2);
const ty = d => H - PAD - d / 100 * (H - PAD * 2);

export function fanCurveEditor(host, fan, onChange, currentTemp) {
  if (!host) return;
  const draw = () => {
    const pts = fan.points;
    const grid = [];
    for (let t = 20; t <= 100; t += 10) grid.push(`<line x1="${tx(t)}" y1="${ty(0)}" x2="${tx(t)}" y2="${ty(100)}" class="fc-grid"/><text x="${tx(t)}" y="${H - 12}" class="fc-ax" text-anchor="middle">${t}°C</text>`);
    for (let d = 0; d <= 100; d += 25) grid.push(`<line x1="${tx(20)}" y1="${ty(d)}" x2="${tx(100)}" y2="${ty(d)}" class="fc-grid"/><text x="${PAD - 6}" y="${ty(d) + 4}" class="fc-ax" text-anchor="end">${d}%</text>`);
    const line = [[20, pts[0][1]], ...pts, [100, 100]].map(([t, d]) => `${tx(t)},${ty(d)}`).join(' ');
    const now = currentTemp ? `<line x1="${tx(currentTemp)}" y1="${ty(0)}" x2="${tx(currentTemp)}" y2="${ty(100)}" class="fc-now"/>` : '';
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="fc${fan.smart ? '' : ' off'}">${grid.join('')}${now}
      <polyline points="${line}" class="fc-line"/>
      ${pts.map(([t, d], i) => `<g><circle cx="${tx(t)}" cy="${ty(d)}" r="7" class="fc-pt" data-p="${i}"/><text x="${tx(t)}" y="${ty(d) - 12}" class="fc-lbl" text-anchor="middle">${t}°C ${d}%</text></g>`).join('')}
    </svg>${fan.smart ? '' : '<div class="fc-note">Smart Fan off: fan runs at 100%</div>'}`;
  };
  draw();
  let drag = -1;
  host.onpointerdown = e => {
    const p = e.target.dataset?.p;
    if (p === undefined || !fan.smart) return;
    drag = Number(p);
    host.setPointerCapture(e.pointerId);
  };
  host.onpointermove = e => {
    if (drag < 0) return;
    const r = host.querySelector('svg').getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W;
    const y = (e.clientY - r.top) / r.height * H;
    const pts = fan.points;
    const lo = drag ? pts[drag - 1][0] + 1 : 20, hi = drag < 3 ? pts[drag + 1][0] - 1 : 100;
    const t = Math.round(Math.min(hi, Math.max(lo, 20 + (x - PAD) / (W - PAD * 2) * 80)));
    const dLo = drag ? pts[drag - 1][1] : 0, dHi = drag < 3 ? pts[drag + 1][1] : 100;
    const d = Math.round(Math.min(dHi, Math.max(dLo, (H - PAD - y) / (H - PAD * 2) * 100)));
    pts[drag] = [t, d];
    draw();
  };
  host.onpointerup = () => { if (drag >= 0) { drag = -1; onChange(); } };
}
