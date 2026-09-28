// Start orb. The glyph is Tabler Icons "layout-grid" (MIT), tinted in four
// quadrants so it reads like the classic four-colour flag without copying it.
export function orb(size = 40, animate = false) {
  return `<span class="orb${animate ? ' orb-anim' : ''}" style="--orb:${size}px" aria-hidden="true"><i class="ti ti-layout-grid"></i></span>`;
}
