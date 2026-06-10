import { delay } from './helpers.js';

export const SCRYFALL = 'https://api.scryfall.com';
let lastCall = 0;

export async function apiGet(url) {
  const wait = Math.max(0, 100 - (Date.now() - lastCall));
  if (wait) await delay(wait);
  lastCall = Date.now();
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function searchCards(query, colors, type, sort, page) {
  let q = (query || '').trim();
  if (!q && !colors && !type) q = '*';
  else if (!q) q = '*';
  if (colors) q += ` c:${colors}`;
  if (type)   q += ` t:${type}`;
  const order = sort === 'edhrec' ? 'edhrec' : sort === 'cmc' ? 'cmc' : 'name';
  const url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=${order}&page=${page}&unique=cards`;
  return apiGet(url);
}

export async function cardByName(name) {
  return apiGet(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`);
}

export async function fetchSuggestionResults(colors, deckIds) {
  const colorStr = colors.join('');
  const q = `c<=${colorStr} -t:land`;
  const url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`;
  const data = await apiGet(url);
  if (!data || !data.data) return [];
  return data.data.filter(c => !deckIds.has(c.id)).slice(0, 20);
}
