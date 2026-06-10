import { state } from './state.js';
import { isBasicLand, isColorLegal, deckTotal, deckLimit } from './helpers.js';
import { showToast } from './ui.js';

// These functions mutate state only — callers are responsible for calling updateDeckUI().

export function setCommander(card) {
  if (state.deck[card.id]) delete state.deck[card.id];
  state.commander = card;
}

export function addCard(card) {
  const limit = deckLimit();
  if (deckTotal() >= limit) {
    const extra = state.commander ? ' (+ Commander)' : '';
    showToast(`Deck full! Max ${limit} cards${extra}.`, 'warn');
    return false;
  }
  if (state.commander && card.id === state.commander.id) {
    showToast(`${card.name} is already your Commander`, 'warn');
    return false;
  }
  if (!isColorLegal(card)) {
    const ci = (state.commander.color_identity || []).join('') || 'C';
    showToast(`${card.name} is outside ${state.commander.name}'s color identity (${ci})`, 'error');
    return false;
  }
  const id = card.id;
  if (state.deck[id]) {
    if (state.format === 'commander' && !isBasicLand(card)) {
      showToast('Commander format: 1 copy max per card (except basic lands)', 'warn');
      return false;
    }
    state.deck[id].qty++;
  } else {
    state.deck[id] = { card, qty: 1 };
  }
  return true;
}

export function removeOne(id) {
  if (!state.deck[id]) return;
  if (state.deck[id].qty <= 1) delete state.deck[id];
  else state.deck[id].qty--;
}

export function removeAll(id) {
  delete state.deck[id];
}

export function addOne(id) {
  if (!state.deck[id]) return false;
  const { card } = state.deck[id];
  if (state.format === 'commander' && !isBasicLand(card)) {
    showToast('Commander format: 1 copy max per card', 'warn');
    return false;
  }
  if (deckTotal() >= deckLimit()) {
    showToast('Deck is full!', 'warn');
    return false;
  }
  state.deck[id].qty++;
  return true;
}
