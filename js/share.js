import { state } from './state.js';
import { SCRYFALL, delay } from './api.js';
import { h, showModal, hideModal, showToast } from './ui.js';
import { updateDeckUI } from './render.js';
import { importText } from './storage.js';

export function generateShareURL() {
  const data = {
    name: state.deckName,
    format: state.format,
    notes: state.deckNotes,
    commander: state.commander ? state.commander.name : null,
    cards: Object.values(state.deck).map(({ card, qty }) => ({ name: card.name, qty })),
  };
  const hash = '#share=' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  return window.location.origin + window.location.pathname + hash;
}

export async function loadFromShareURL() {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return false;
  try {
    const json = decodeURIComponent(escape(atob(hash.slice(7))));
    const data = JSON.parse(json);

    showToast('Loading shared deck…', 'info');

    const identifiers = data.cards.map(c => ({ name: c.name }));
    if (data.commander) identifiers.push({ name: data.commander });

    const fetched = {};
    for (let i = 0; i < identifiers.length; i += 75) {
      const batch = identifiers.slice(i, i + 75);
      const res = await fetch(`${SCRYFALL}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch }),
      });
      const json2 = await res.json();
      (json2.data || []).forEach(c => { fetched[c.name.toLowerCase()] = c; });
      if (i + 75 < identifiers.length) await delay(100);
    }

    state.deck = {};
    state.format = data.format || 'commander';
    state.deckName = data.name || 'Shared Deck';
    state.deckNotes = data.notes || '';
    state.commander = data.commander ? (fetched[data.commander.toLowerCase()] || null) : null;

    data.cards.forEach(({ name, qty }) => {
      const card = fetched[name.toLowerCase()];
      if (card) state.deck[card.id] = { card, qty };
    });

    document.getElementById('format-select').value = state.format;
    document.getElementById('deck-name-input').value = state.deckName;
    const notesEl = document.getElementById('deck-notes');
    if (notesEl) notesEl.value = state.deckNotes;

    history.replaceState(null, '', window.location.pathname);
    updateDeckUI();
    showToast(`Loaded "${state.deckName}" (${Object.keys(state.deck).length} cards)`, 'success');
    return true;
  } catch (e) {
    console.error('Share URL parse failed', e);
    showToast('Could not load shared deck', 'error');
    return false;
  }
}

export function showShareModal() {
  if (!Object.keys(state.deck).length) { showToast('Add cards to the deck first', 'warn'); return; }
  const url = generateShareURL();
  const wrap = document.createElement('div');
  const title = h('h3', 'Share Deck');
  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin-bottom:10px;';
  desc.textContent = 'Anyone with this link can open your exact deck — no account needed.';

  const urlBox = document.createElement('input');
  urlBox.type = 'text';
  urlBox.value = url;
  urlBox.readOnly = true;
  urlBox.style.cssText = 'width:100%;margin-bottom:10px;font-size:0.75rem;';
  urlBox.addEventListener('click', () => urlBox.select());

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-gold tune-full-btn';
  copyBtn.textContent = 'Copy Link';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
    });
  });

  wrap.append(title, desc, urlBox, copyBtn);
  showModal(wrap);
}

export async function importFromURL(rawUrl) {
  const url = rawUrl.trim();

  const archiMatch = url.match(/archidekt\.com\/decks\/(\d+)/);
  if (archiMatch) return importArchidekt(archiMatch[1]);

  const moxMatch = url.match(/moxfield\.com\/decks\/([\w-]+)/);
  if (moxMatch) return importMoxfield(moxMatch[1]);

  showToast('Unrecognized URL — paste deck text below instead', 'warn');
  return false;
}

async function importArchidekt(deckId) {
  try {
    showToast('Fetching from Archidekt…', 'info');
    const res = await fetch(`https://archidekt.com/api/decks/${deckId}/small/`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    const lines = [];
    let commanderName = null;

    (data.cards || []).forEach(entry => {
      const name = entry.card?.oracleCard?.name || entry.card?.name;
      const qty  = entry.quantity || 1;
      const cats = (entry.categories || []).map(c => (typeof c === 'string' ? c : c.name || '').toLowerCase());
      if (!name) return;
      if (cats.includes('commander')) { commanderName = name; return; }
      if (cats.includes('maybeboard') || cats.includes('sideboard')) return;
      lines.push(`${qty} ${name}`);
    });

    if (commanderName) lines.unshift(`// Commander: ${commanderName}`);
    if (data.name) state.deckName = data.name;

    await importText(lines.join('\n'));
    showToast(`Imported "${data.name || 'Archidekt deck'}"`, 'success');
    return true;
  } catch (e) {
    showToast('Archidekt import failed — try pasting the deck list', 'error');
    console.error(e);
    return false;
  }
}

async function importMoxfield(deckSlug) {
  try {
    showToast('Fetching from Moxfield…', 'info');
    const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckSlug}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    const lines = [];
    const sections = ['mainboard', 'commanders', 'companions'];

    sections.forEach(section => {
      const cards = data[section] || {};
      Object.entries(cards).forEach(([, entry]) => {
        const name = entry.card?.name;
        const qty  = entry.quantity || 1;
        if (!name) return;
        if (section === 'commanders') lines.unshift(`// Commander: ${name}`);
        else lines.push(`${qty} ${name}`);
      });
    });

    if (data.name) state.deckName = data.name;
    await importText(lines.join('\n'));
    showToast(`Imported "${data.name || 'Moxfield deck'}"`, 'success');
    return true;
  } catch (e) {
    showToast('Moxfield import failed — try pasting the deck text instead', 'warn');
    console.error(e);
    return false;
  }
}

export function showImportModal() {
  const wrap = document.createElement('div');
  const title = h('h3', 'Import Deck');

  const urlLabel = document.createElement('p');
  urlLabel.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin:8px 0 4px;';
  urlLabel.textContent = 'Paste an Archidekt or Moxfield deck URL:';

  const urlRow = document.createElement('div');
  urlRow.style.cssText = 'display:flex;gap:6px;margin-bottom:14px;';
  const urlIn = document.createElement('input');
  urlIn.type = 'text';
  urlIn.placeholder = 'https://archidekt.com/decks/12345/...';
  urlIn.style.flex = '1';
  const urlBtn = document.createElement('button');
  urlBtn.className = 'btn btn-gold';
  urlBtn.textContent = 'Import URL';
  urlBtn.addEventListener('click', async () => {
    if (!urlIn.value.trim()) return;
    hideModal();
    await importFromURL(urlIn.value);
  });
  urlRow.append(urlIn, urlBtn);

  const div = document.createElement('p');
  div.style.cssText = 'text-align:center;font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px;';
  div.textContent = '— or paste a deck list —';

  const hint = document.createElement('p');
  hint.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);margin-bottom:6px;';
  hint.innerHTML = 'One card per line: <code>4 Lightning Bolt</code>  ·  Works with MTGO, Arena, and most export formats';

  const ta = document.createElement('textarea');
  ta.className = 'export-textarea';
  ta.placeholder = '1 Sol Ring\n4 Lightning Bolt\n24 Mountain\n...';

  const textBtn = document.createElement('button');
  textBtn.className = 'btn btn-gold tune-full-btn';
  textBtn.textContent = 'Import List';
  textBtn.addEventListener('click', () => { hideModal(); importText(ta.value); });

  const moxNote = document.createElement('p');
  moxNote.style.cssText = 'font-size:0.72rem;color:var(--text-secondary);margin-top:10px;';
  moxNote.textContent = 'Tip: For Moxfield, try the URL above. If it fails (CORS), use Export → MTGO in Moxfield and paste the text.';

  wrap.append(title, urlLabel, urlRow, div, hint, ta, textBtn, moxNote);
  showModal(wrap);
}
