import { state } from './state.js';
import { searchCards, fetchSuggestionResults } from './api.js';
import { renderSearch, renderSuggestions } from './render.js';
import { showToast } from './ui.js';

export async function doSearch() {
  const query  = document.getElementById('search-input').value.trim();
  const colors = document.getElementById('color-filter').value;
  const type   = document.getElementById('type-filter').value;
  const sort   = document.getElementById('sort-filter').value;

  state.search = { ...state.search, query, colors, type, sort, page: 1 };

  const btn = document.getElementById('search-btn');
  btn.textContent = 'Searching...';
  btn.disabled = true;

  try {
    const data = await searchCards(query, colors, type, sort, 1);
    if (!data) { renderSearch([]); return; }

    state.search.results = data.data || [];
    state.search.hasMore = data.has_more || false;

    renderSearch(state.search.results);
    updatePagination();
  } catch (e) {
    showToast('Search failed. Try again.', 'error');
    renderSearch([]);
  } finally {
    btn.textContent = 'Search';
    btn.disabled = false;
  }
}

export async function doPage(delta) {
  const newPage = state.search.page + delta;
  if (newPage < 1) return;
  state.search.page = newPage;

  try {
    const { query, colors, type, sort } = state.search;
    const data = await searchCards(query, colors, type, sort, newPage);
    if (!data) return;
    state.search.results = data.data || [];
    state.search.hasMore = data.has_more || false;
    renderSearch(state.search.results);
    updatePagination();
    document.querySelector('.search-panel').scrollTop = 0;
  } catch { showToast('Failed to load page', 'error'); }
}

export function updatePagination() {
  const pg = document.getElementById('pagination');
  if (!state.search.results.length) { pg.classList.add('hidden'); return; }
  pg.classList.remove('hidden');
  document.getElementById('page-info').textContent = `Page ${state.search.page}`;
  document.getElementById('prev-page').disabled = state.search.page <= 1;
  document.getElementById('next-page').disabled = !state.search.hasMore;
}

export async function doSuggestions() {
  const colorSet = new Set();
  if (state.commander) {
    (state.commander.color_identity || []).forEach(c => colorSet.add(c));
  }
  for (const { card } of Object.values(state.deck)) {
    (card.color_identity || card.colors || []).forEach(c => colorSet.add(c));
  }

  if (!colorSet.size) {
    showToast('Set a Commander or add cards first!', 'warn');
    return;
  }

  const btn = document.getElementById('suggest-btn');
  btn.textContent = 'Loading...';
  btn.disabled = true;

  try {
    const deckIds = new Set(Object.keys(state.deck));
    const cards = await fetchSuggestionResults([...colorSet], deckIds);
    renderSuggestions(cards);
    if (!cards.length) showToast('No suggestions found', 'warn');
  } catch {
    showToast('Could not fetch suggestions', 'error');
  } finally {
    btn.textContent = 'Get Suggestions';
    btn.disabled = false;
  }
}
