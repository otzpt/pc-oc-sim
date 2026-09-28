// Minimal multi-series line chart on canvas, for sensor history.
export function drawChart(canvas, series, { min, max, unit = '', grid = 4 } = {}) {
  const dpr = 1;
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const all = series.flatMap(s => s.data);
  const lo = min ?? Math.min(...all), hi = max ?? Math.max(...all, lo + 1);
  g.strokeStyle = '#243040'; g.lineWidth = 1; g.fillStyle = '#7f8b99'; g.font = '10px "IBM Plex Mono", monospace';
  for (let i = 0; i <= grid; i++) {
    const y = 6 + (h - 12) * i / grid;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    g.fillText(`${(hi - (hi - lo) * i / grid).toFixed(hi - lo < 5 ? 2 : 0)}${unit}`, 4, y - 2 > 8 ? y - 2 : y + 10);
  }
  for (const s of series) {
    const d = s.data;
    if (d.length < 2) continue;
    g.strokeStyle = s.color; g.lineWidth = 1.6; g.beginPath();
    d.forEach((v, i) => {
      const x = w * i / (d.length - 1);
      const y = 6 + (h - 12) * (1 - (v - lo) / (hi - lo || 1));
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
}
