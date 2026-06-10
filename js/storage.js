import { state } from './state.js';
import { getType } from './helpers.js';
import { cardByName, SCRYFALL, delay } from './api.js';
import { showToast } from './ui.js';
import { updateDeckUI } from './render.js';
import { TYPE_ORDER } from './state.js';

export function saveDeck(name) {
  const decks = JSON.parse(localStorage.getItem('mtg-decks') || '{}');
  decks[name] = {
    format: state.format,
    commander: state.commander || null,
    cards: Object.values(state.deck).map(({ card, qty }) => ({ card, qty })),
    notes: state.deckNotes || '',
  };
  localStorage.setItem('mtg-decks', JSON.stringify(decks));
}

export function loadDeckByName(name) {
  const decks = JSON.parse(localStorage.getItem('mtg-decks') || '{}');
  const saved = decks[name];
  if (!saved) return;
  state.deck = {};
  state.commander = saved.commander || null;
  state.format = saved.format || 'commander';
  state.deckNotes = saved.notes || '';
  document.getElementById('format-select').value = state.format;
  saved.cards.forEach(({ card, qty }) => { state.deck[card.id] = { card, qty }; });
  document.getElementById('deck-name-input').value = name;
  state.deckName = name;
  const notesEl = document.getElementById('deck-notes');
  if (notesEl) notesEl.value = state.deckNotes;
  updateDeckUI();
  showToast(`Loaded "${name}"`, 'success');
}

export function deleteSavedDeck(name) {
  const decks = JSON.parse(localStorage.getItem('mtg-decks') || '{}');
  delete decks[name];
  localStorage.setItem('mtg-decks', JSON.stringify(decks));
}

export function savedDeckNames() {
  return Object.keys(JSON.parse(localStorage.getItem('mtg-decks') || '{}'));
}

export function autoSave() {
  saveDeck(state.deckName || 'My Deck');
}

export function exportText() {
  const lines = [];
  if (state.commander) {
    lines.push('// Commander');
    lines.push(`1 ${state.commander.name}`);
    lines.push('');
  }
  TYPE_ORDER.forEach(type => {
    const cards = Object.values(state.deck)
      .filter(({ card }) => getType(card) === type)
      .sort((a, b) => a.card.name.localeCompare(b.card.name));
    if (!cards.length) return;
    lines.push(`// ${type}`);
    cards.forEach(({ card, qty }) => lines.push(`${qty} ${card.name}`));
    lines.push('');
  });
  return lines.join('\n');
}

export async function importText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
  state.deck = {};
  let ok = 0, fail = 0;

  for (const line of lines) {
    const m = line.match(/^(\d+)x?\s+(.+)$/);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const name = m[2].trim();
    try {
      const card = await cardByName(name);
      if (card && card.id) { state.deck[card.id] = { card, qty }; ok++; }
      else fail++;
    } catch { fail++; }
    await delay(120);
  }

  updateDeckUI();
  showToast(`Imported ${ok} card type(s)${fail ? `, ${fail} not found` : ''}`, 'success');
}
