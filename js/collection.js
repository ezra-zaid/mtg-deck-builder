import { state } from './state.js';
import { apiGet, SCRYFALL } from './api.js';
import { isOwned, ownedQty } from './helpers.js';
import { h, showModal, hideModal, showToast, showPreview, hidePreview, movePreview } from './ui.js';
import { updateDeckUI } from './render.js';

const collectionCache = {};
let hoverFetchTimer = null;

export async function fetchCollectionCard(name) {
  const key = name.toLowerCase();
  if (key in collectionCache) return collectionCache[key];
  try {
    const data = await apiGet(`${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`);
    collectionCache[key] = data || null;
  } catch { collectionCache[key] = null; }
  return collectionCache[key];
}

export function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += ch;
  }
  cols.push(cur);
  return cols.map(c => c.trim());
}

export function parseCollection(text) {
  const result = {};
  const lines = text.split('\n');
  if (!lines.length) return result;

  const firstMeaningful = lines.find(l => l.trim());
  const looksLikeCSV = firstMeaningful && firstMeaningful.includes(',') &&
    /\bname\b/i.test(firstMeaningful.split(',')[0]);

  if (looksLikeCSV) {
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const nameIdx = header.findIndex(h => /^(card\s*)?name$/.test(h));
    const qtyIdx  = header.findIndex(h => /^(qty|quantity|count|amount|copies)$/.test(h));
    if (nameIdx === -1) return result;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const name = (cols[nameIdx] || '').trim();
      const qty  = qtyIdx >= 0 ? (parseInt(cols[qtyIdx]) || 1) : 1;
      if (name) result[name.toLowerCase()] = (result[name.toLowerCase()] || 0) + qty;
    }
    return result;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    let qty = 1, name = line;

    const prefixMatch = line.match(/^(\d+)x?\s+(.+)/);
    if (prefixMatch) {
      qty = parseInt(prefixMatch[1]);
      name = prefixMatch[2];
    } else {
      const suffixMatch = line.match(/^(.+?)\s+x(\d+)$/i);
      if (suffixMatch) { qty = parseInt(suffixMatch[2]); name = suffixMatch[1]; }
    }

    name = name.replace(/\s*\([A-Z0-9]{2,6}\)\s*\d*\s*$/, '').replace(/\s*\*F\*\s*$/, '').trim();
    if (name) result[name.toLowerCase()] = (result[name.toLowerCase()] || 0) + qty;
  }
  return result;
}

export function showCollectionBrowser() {
  const ROWS_PER_PAGE = 60;
  let page = 0;
  let filterMode = 'all';
  let sortMode   = 'name';
  let query      = '';

  const deckNames = new Set(
    Object.values(state.deck).map(({ card }) => card.name.toLowerCase())
  );

  function getList() {
    return Object.entries(state.collection)
      .filter(([name]) => {
        if (query && !name.includes(query.toLowerCase())) return false;
        if (filterMode === 'in-deck')     return deckNames.has(name);
        if (filterMode === 'not-in-deck') return !deckNames.has(name);
        return true;
      })
      .sort((a, b) => {
        if (sortMode === 'qty') return b[1] - a[1] || a[0].localeCompare(b[0]);
        return a[0].localeCompare(b[0]);
      });
  }

  const totalUnique = Object.keys(state.collection).length;
  const totalQty    = Object.values(state.collection).reduce((s, n) => s + n, 0);

  const wrap = document.createElement('div');

  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-xs';
  backBtn.textContent = '← Upload';
  backBtn.addEventListener('click', showCollectionModal);

  const titleEl = document.createElement('h3');
  titleEl.style.margin = '0';
  titleEl.textContent = `My Collection`;

  const countEl = document.createElement('span');
  countEl.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);margin-left:auto;white-space:nowrap;';
  countEl.textContent = `${totalUnique.toLocaleString()} unique · ${totalQty.toLocaleString()} total`;

  headerRow.append(backBtn, titleEl, countEl);

  const controlRow = document.createElement('div');
  controlRow.className = 'coll-controls';

  const searchIn = document.createElement('input');
  searchIn.type = 'text';
  searchIn.placeholder = 'Search collection...';
  searchIn.style.flex = '1';

  const filterSel = document.createElement('select');
  [['all', 'All cards'], ['in-deck', 'In deck'], ['not-in-deck', 'Not in deck']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; filterSel.appendChild(o);
  });

  const sortSel = document.createElement('select');
  [['name', 'By name'], ['qty', 'By quantity']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; sortSel.appendChild(o);
  });

  controlRow.append(searchIn, filterSel, sortSel);

  const listWrap = document.createElement('div');
  listWrap.className = 'coll-list';

  const pageBar = document.createElement('div');
  pageBar.className = 'coll-page-bar';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn-xs'; prevBtn.textContent = '← Prev';

  const pageInfo = document.createElement('span');
  pageInfo.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-xs'; nextBtn.textContent = 'Next →';

  pageBar.append(prevBtn, pageInfo, nextBtn);

  wrap.append(headerRow, controlRow, listWrap, pageBar);
  showModal(wrap);

  function render() {
    const list = getList();
    const totalPages = Math.max(1, Math.ceil(list.length / ROWS_PER_PAGE));
    page = Math.min(page, totalPages - 1);
    const slice = list.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

    listWrap.innerHTML = '';

    if (!slice.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-secondary);font-size:0.85rem;padding:12px 0;';
      empty.textContent = 'No cards match.';
      listWrap.appendChild(empty);
    } else {
      slice.forEach(([name, qty]) => {
        const row = document.createElement('div');
        row.className = 'coll-row';

        const qtySpan = document.createElement('span');
        qtySpan.className = 'coll-qty';
        qtySpan.textContent = `${qty}×`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'coll-name';
        nameSpan.textContent = name.charAt(0).toUpperCase() + name.slice(1);

        const badges = document.createElement('span');
        badges.className = 'coll-badges';

        if (deckNames.has(name)) {
          const b = document.createElement('span');
          b.className = 'owned-badge';
          b.textContent = 'In deck';
          badges.appendChild(b);
        }

        row.append(qtySpan, nameSpan, badges);

        row.addEventListener('mouseenter', e => {
          clearTimeout(hoverFetchTimer);
          hoverFetchTimer = setTimeout(async () => {
            const card = await fetchCollectionCard(name);
            if (card) showPreview(card, e);
          }, 250);
        });
        row.addEventListener('mouseleave', () => { clearTimeout(hoverFetchTimer); hidePreview(); });
        row.addEventListener('mousemove', movePreview);

        listWrap.appendChild(row);
      });
    }

    const start = list.length ? page * ROWS_PER_PAGE + 1 : 0;
    const end   = Math.min((page + 1) * ROWS_PER_PAGE, list.length);
    pageInfo.textContent = list.length ? `${start}–${end} of ${list.length.toLocaleString()}` : 'No results';
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= totalPages - 1;
  }

  let searchDebounce;
  searchIn.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { query = searchIn.value; page = 0; render(); }, 200);
  });
  filterSel.addEventListener('change', () => { filterMode = filterSel.value; page = 0; render(); });
  sortSel.addEventListener('change',   () => { sortMode   = sortSel.value;   page = 0; render(); });
  prevBtn.addEventListener('click', () => { page--; render(); });
  nextBtn.addEventListener('click', () => { page++; render(); });

  render();
}

export function saveCollection() {
  localStorage.setItem('mtg-collection', JSON.stringify(state.collection));
}

export function loadCollection() {
  try {
    const raw = localStorage.getItem('mtg-collection');
    if (raw) state.collection = JSON.parse(raw);
  } catch { state.collection = {}; }
}

export function showCollectionModal() {
  const collectionSize = Object.keys(state.collection).length;
  const wrap = document.createElement('div');

  const title = h('h3', collectionSize ? `My Collection (${collectionSize.toLocaleString()} unique cards)` : 'Upload My Collection');

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;';
  desc.innerHTML = 'Supports <strong>plain text</strong> (one card per line: <code>4 Lightning Bolt</code>) or <strong>CSV</strong> with a "Name" column (Moxfield, TCGPlayer, etc.).';

  const dropZone = document.createElement('div');
  dropZone.className = 'collection-drop';
  dropZone.textContent = 'Drop a .txt or .csv file here, or click to browse';

  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = '.txt,.csv,.text';
  fileIn.style.display = 'none';

  dropZone.addEventListener('click', () => fileIn.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) readFile(fileIn.files[0]); });

  const orLabel = document.createElement('p');
  orLabel.textContent = '— or paste your list —';
  orLabel.style.cssText = 'text-align:center;font-size:0.78rem;color:var(--text-secondary);margin:10px 0 4px;';

  const textarea = document.createElement('textarea');
  textarea.className = 'collection-paste';
  textarea.placeholder = '4 Sol Ring\n1 Lightning Bolt\nCommander\'s Sphere\n...';
  textarea.rows = 8;

  const feedback = document.createElement('p');
  feedback.className = 'collection-feedback';

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-gold tune-full-btn';
  importBtn.textContent = 'Import List';
  importBtn.addEventListener('click', () => importText(textarea.value));

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;';

  if (collectionSize) {
    const browseBtn = document.createElement('button');
    browseBtn.className = 'btn btn-collection';
    browseBtn.style.cssText = 'flex:2;font-size:0.82rem;';
    browseBtn.textContent = 'Browse Collection';
    browseBtn.addEventListener('click', showCollectionBrowser);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-danger';
    clearBtn.style.cssText = 'flex:1;font-size:0.82rem;';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      state.collection = {};
      saveCollection();
      updateDeckUI();
      hideModal();
      showToast('Collection cleared', 'info');
    });
    importBtn.style.flex = '2';
    btnRow.append(browseBtn, importBtn, clearBtn);
  } else {
    importBtn.style.width = '100%';
    btnRow.appendChild(importBtn);
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = e => { textarea.value = e.target.result; importText(e.target.result); };
    reader.readAsText(file);
  }

  function importText(text) {
    if (!text.trim()) { showToast('Nothing to import', 'warn'); return; }
    const parsed = parseCollection(text.trim());
    const count = Object.keys(parsed).length;
    if (!count) { feedback.textContent = 'Could not parse any cards. Check the format.'; feedback.style.color = '#f87171'; return; }
    state.collection = parsed;
    saveCollection();
    updateDeckUI();
    feedback.textContent = `Imported ${count.toLocaleString()} unique cards!`;
    feedback.style.color = '#4ade80';
    title.textContent = `My Collection (${count.toLocaleString()} unique cards)`;
    showToast(`Collection loaded: ${count.toLocaleString()} unique cards`, 'success');
  }

  wrap.append(title, desc, dropZone, fileIn, orLabel, textarea, feedback, btnRow);
  showModal(wrap);
}

