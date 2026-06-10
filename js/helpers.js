import { state, FORMAT_LIMITS } from './state.js';

export function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export function getImage(card, size = 'normal') {
  if (card.image_uris) return card.image_uris[size];
  if (card.card_faces && card.card_faces[0].image_uris) return card.card_faces[0].image_uris[size];
  return '';
}

export function getType(card) {
  const t = card.type_line || '';
  if (t.includes('Creature'))     return 'Creature';
  if (t.includes('Planeswalker')) return 'Planeswalker';
  if (t.includes('Instant'))      return 'Instant';
  if (t.includes('Sorcery'))      return 'Sorcery';
  if (t.includes('Enchantment'))  return 'Enchantment';
  if (t.includes('Artifact'))     return 'Artifact';
  if (t.includes('Land'))         return 'Land';
  return 'Other';
}

export function isBasicLand(card) { return (card.type_line || '').includes('Basic Land'); }
export function isLegendary(card) { return (card.type_line || '').includes('Legendary'); }

export function isColorLegal(card) {
  if (!state.commander || state.format !== 'commander') return true;
  if (isBasicLand(card)) return true;
  const cmdCI = new Set(state.commander.color_identity || []);
  return (card.color_identity || []).every(c => cmdCI.has(c));
}

export function deckTotal() {
  return Object.values(state.deck).reduce((s, { qty }) => s + qty, 0);
}

export function deckLimit() {
  const limit = FORMAT_LIMITS[state.format];
  return (state.format === 'commander' && state.commander) ? limit - 1 : limit;
}

export function formatPrice(card, qty = 1) {
  const p = parseFloat(card.prices?.usd);
  if (!p) return '—';
  return qty > 1 ? `$${(p * qty).toFixed(2)}` : `$${p.toFixed(2)}`;
}

export function isOwned(card) {
  return card.name.toLowerCase() in state.collection;
}

export function ownedQty(card) {
  return state.collection[card.name.toLowerCase()] || 0;
}

export function isBannedInFormat(card) {
  if (!card.legalities) return false;
  const status = card.legalities[state.format];
  return status === 'banned' || status === 'restricted';
}
