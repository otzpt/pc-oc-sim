// Notepad. Files are kept in localStorage under this simulated PC.
import { save } from '../state.js';
import { esc } from '../ui/esc.js';

export default {
  id: 'notepad', title: 'Notepad', icon: 'ti-notes', color: '#8ab4d8', w: 640, h: 440,
  mount(body, { state, setTitle }) {
    let name = 'Untitled.txt';
    let dirty = false;
    body.innerHTML = `
      <ul role="menubar" class="can-hover np-menu">
        <li role="menuitem" tabindex="0" aria-haspopup="true">File
          <ul role="menu">
            <li role="menuitem" data-np="new"><button>New</button></li>
            <li role="menuitem" data-np="open"><button>Open...</button></li>
            <li role="menuitem" data-np="save"><button>Save</button></li>
            <li role="menuitem" data-np="saveas"><button>Save As...</button></li>
            <li role="menuitem" data-np="delete"><button>Delete file</button></li>
          </ul>
        </li>
        <li role="menuitem" tabindex="0" aria-haspopup="true">Format
          <ul role="menu"><li role="menuitem" data-np="wrap"><button>Word Wrap</button></li></ul>
        </li>
      </ul>
      <div class="np-panel" hidden></div>
      <textarea class="np-text app-grow" spellcheck="false" style="resize:none;border:0;font:13px Consolas,'IBM Plex Mono',monospace;padding:6px;white-space:pre;overflow:auto" aria-label="Document"></textarea>
      <div class="status-bar"><p class="status-bar-field np-pos">Ln 1, Col 1</p><p class="status-bar-field np-file"></p></div>`;
    const text = body.querySelector('.np-text');
    const panel = body.querySelector('.np-panel');
    const title = () => { setTitle(`${dirty ? '*' : ''}${name} - Notepad`); body.querySelector('.np-file').textContent = `${Object.keys(state.notes).length} saved file(s)`; };
    const load = n => { name = n; text.value = state.notes[n] ?? ''; dirty = false; panel.hidden = true; title(); };
    const ask = (label, value, done) => {
      panel.hidden = false;
      panel.innerHTML = `<div class="app-row" style="padding:6px;background:#fff;border-bottom:1px solid #ccc"><label>${label} <input class="np-name" value="${esc(value)}"></label><button class="np-ok">OK</button><button class="np-cancel">Cancel</button></div>`;
      const inp = panel.querySelector('.np-name');
      inp.focus(); inp.select();
      panel.querySelector('.np-ok').onclick = () => done(inp.value.trim());
      panel.querySelector('.np-cancel').onclick = () => { panel.hidden = true; };
      inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); };
    };
    const write = n => {
      if (!n) return;
      name = /\.\w+$/.test(n) ? n : `${n}.txt`;
      state.notes[name] = text.value; save('notes'); dirty = false; panel.hidden = true; title();
    };
    body.addEventListener('click', e => {
      const a = e.target.closest('[data-np]')?.dataset.np;
      if (!a) return;
      if (a === 'new') { name = 'Untitled.txt'; text.value = ''; dirty = false; title(); }
      if (a === 'save') name === 'Untitled.txt' ? ask('File name:', 'notes.txt', write) : write(name);
      if (a === 'saveas') ask('File name:', name, write);
      if (a === 'delete' && state.notes[name] !== undefined) { delete state.notes[name]; save('notes'); name = 'Untitled.txt'; text.value = ''; title(); }
      if (a === 'wrap') text.style.whiteSpace = text.style.whiteSpace === 'pre' ? 'pre-wrap' : 'pre';
      if (a === 'open') {
        panel.hidden = false;
        const files = Object.keys(state.notes);
        panel.innerHTML = `<div style="padding:6px;background:#fff;border-bottom:1px solid #ccc"><b>Open</b><ul class="tree-view" style="margin-top:6px">${files.map(f => `<li><a href="#" data-file="${esc(f)}">${esc(f)}</a></li>`).join('') || '<li>No saved files</li>'}</ul></div>`;
      }
    });
    panel.addEventListener('click', e => { const f = e.target.closest('[data-file]'); if (f) { e.preventDefault(); load(f.dataset.file); } });
    const pos = () => {
      const before = text.value.slice(0, text.selectionStart).split('\n');
      body.querySelector('.np-pos').textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
    };
    text.addEventListener('input', () => { if (!dirty) { dirty = true; title(); } pos(); });
    text.addEventListener('click', pos); text.addEventListener('keyup', pos);
    text.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); name === 'Untitled.txt' ? ask('File name:', 'notes.txt', write) : write(name); } });
    load(Object.keys(state.notes)[0] ?? 'Untitled.txt');
  },
};
