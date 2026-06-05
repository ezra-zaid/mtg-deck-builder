// ==================== STATE ====================
const state = {
  deck: {},   // cardId -> { card, qty }
  commander: null,
  search: { results: [], page: 1, hasMore: false, query: '', colors: '', type: '', sort: 'name' },
  format: 'commander',
  deckName: 'My Deck',
  deckSort: 'type',
  budgetThreshold: null,
  collection: {},  // lowercase card name -> qty owned
  deckNotes: '',
};

const FORMAT_LIMITS = { commander: 100, standard: 60, modern: 60, legacy: 60, pauper: 60 };

const TYPE_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Other'];

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
const COLOR_HEX   = { W: '#f5f0e0', U: '#3b82f6', B: '#a855f7', R: '#ef4444', G: '#22c55e', C: '#9ca3af' };

// ==================== SCRYFALL API ====================
const SCRYFALL = 'https://api.scryfall.com';
let lastCall = 0;

async function apiGet(url) {
  const wait = Math.max(0, 100 - (Date.now() - lastCall));
  if (wait) await delay(wait);
  lastCall = Date.now();

  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchCards(query, colors, type, sort, page) {
  let q = (query || '').trim();
  if (!q && !colors && !type) q = '*';
  else if (!q) q = '*';
  if (colors) q += ` c:${colors}`;
  if (type)   q += ` t:${type}`;

  const order = sort === 'edhrec' ? 'edhrec' : sort === 'cmc' ? 'cmc' : 'name';
  const url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=${order}&page=${page}&unique=cards`;
  return apiGet(url);
}

async function cardByName(name) {
  return apiGet(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`);
}

async function fetchSuggestionResults(colors, deckIds) {
  const colorStr = colors.join('');
  const q = `c<=${colorStr} -t:land`;
  const url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`;
  const data = await apiGet(url);
  if (!data || !data.data) return [];
  return data.data.filter(c => !deckIds.has(c.id)).slice(0, 20);
}

// ==================== HELPERS ====================
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function getImage(card, size = 'normal') {
  if (card.image_uris) return card.image_uris[size];
  if (card.card_faces && card.card_faces[0].image_uris) return card.card_faces[0].image_uris[size];
  return '';
}

function getType(card) {
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

function isBasicLand(card) { return (card.type_line || '').includes('Basic Land'); }
function isLegendary(card) { return (card.type_line || '').includes('Legendary'); }

// Returns true if the card's color identity fits within the commander's color identity.
// Colorless cards and basic lands are always legal.
function isColorLegal(card) {
  if (!state.commander || state.format !== 'commander') return true;
  if (isBasicLand(card)) return true;
  const cmdCI = new Set(state.commander.color_identity || []);
  return (card.color_identity || []).every(c => cmdCI.has(c));
}

function deckTotal() {
  return Object.values(state.deck).reduce((s, { qty }) => s + qty, 0);
}

// When a commander is set in commander format, deck holds 99 cards; commander is the 100th.
function deckLimit() {
  const limit = FORMAT_LIMITS[state.format];
  return (state.format === 'commander' && state.commander) ? limit - 1 : limit;
}

// ==================== COMMANDER ====================
function setCommander(card) {
  if (state.deck[card.id]) delete state.deck[card.id];
  state.commander = card;
  updateDeckUI();
  showToast(`${card.name} set as Commander`, 'success');
}

function showBuildDeckModal() {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
  const title = h('h3', `Build Deck for ${state.commander.name}`);

  // ── Total land count ──
  const totalRow = document.createElement('div');
  totalRow.className = 'land-input-row';
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total lands in deck:';
  const totalIn = document.createElement('input');
  totalIn.type = 'number'; totalIn.min = '0'; totalIn.max = '60'; totalIn.value = '37';
  totalRow.append(totalLabel, totalIn);

  // ── Basic land count (slider + number) ──
  const basicSection = document.createElement('div');
  basicSection.className = 'land-mode-row';
  basicSection.style.flexDirection = 'column';
  basicSection.style.gap = '8px';

  const basicHeader = document.createElement('div');
  basicHeader.style.cssText = 'display:flex;align-items:center;gap:10px;';
  const basicLabel = document.createElement('strong');
  basicLabel.textContent = 'Basic lands:';
  const basicIn = document.createElement('input');
  basicIn.type = 'number'; basicIn.min = '0'; basicIn.max = '60'; basicIn.value = '37';
  basicIn.style.width = '64px';
  const basicDesc = document.createElement('span');
  basicDesc.className = 'land-mode-desc';
  basicDesc.textContent = 'Plains, Islands, Swamps, Mountains, Forests';
  basicHeader.append(basicLabel, basicIn, basicDesc);

  // Non-basic fill toggle
  const specialRow = document.createElement('div');
  specialRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:2px;';
  const specialCheck = document.createElement('input');
  specialCheck.type = 'checkbox'; specialCheck.id = 'special-lands-check'; specialCheck.checked = false;
  const specialLabel = document.createElement('label');
  specialLabel.htmlFor = 'special-lands-check';
  specialLabel.style.cssText = 'font-size:0.82rem;cursor:pointer;';
  specialLabel.innerHTML = 'Fill remaining <strong id="special-count">0</strong> land slot(s) with <strong>non-basic lands</strong> (Command Tower, fetch lands, shocks, etc. via EDHRec)';
  specialRow.append(specialCheck, specialLabel);

  basicSection.append(basicHeader, specialRow);

  // Keep counts in sync: basics ≤ total, special count = total − basics
  function syncCounts() {
    const total = Math.max(0, Math.min(60, parseInt(totalIn.value) || 0));
    const basics = Math.max(0, Math.min(total, parseInt(basicIn.value) || 0));
    basicIn.value = basics;
    const special = total - basics;
    const countEl = document.getElementById('special-count');
    if (countEl) countEl.textContent = special;
    specialCheck.disabled = special === 0;
    if (special === 0) specialCheck.checked = false;
  }

  totalIn.addEventListener('input', syncCounts);
  basicIn.addEventListener('input', syncCounts);
  syncCounts();

  // ── No lands option ──
  const noLandRow = document.createElement('label');
  noLandRow.className = 'land-mode-row';
  noLandRow.style.cssText = 'align-items:center;gap:8px;';
  const noLandCheck = document.createElement('input');
  noLandCheck.type = 'checkbox'; noLandCheck.id = 'no-land-check';
  const noLandLabel = document.createElement('span');
  noLandLabel.innerHTML = "<strong>Skip all lands</strong> <span class='land-mode-desc'>— I'll add them manually</span>";
  noLandRow.append(noLandCheck, noLandLabel);

  noLandCheck.addEventListener('change', () => {
    totalIn.disabled = noLandCheck.checked;
    basicIn.disabled = noLandCheck.checked;
    specialCheck.disabled = noLandCheck.checked;
  });

  // ── Build button ──
  const buildBtn = document.createElement('button');
  buildBtn.className = 'btn btn-gold tune-full-btn';
  buildBtn.textContent = 'Build Deck';
  buildBtn.addEventListener('click', () => {
    const skipLands = noLandCheck.checked;
    const landCount  = skipLands ? 0 : Math.max(0, Math.min(60, parseInt(totalIn.value) || 37));
    const basicCount = skipLands ? 0 : Math.max(0, Math.min(landCount, parseInt(basicIn.value) || landCount));
    const fillSpecial = !skipLands && specialCheck.checked && (landCount - basicCount) > 0;
    hideModal();
    buildDeck({ landCount, basicCount, fillSpecial });
  });

  wrap.append(title, totalRow, basicSection, noLandRow, buildBtn);
  showModal(wrap);
}

async function buildDeck({ landCount = 37, basicCount = 37, fillSpecial = false } = {}) {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const btn = document.getElementById('build-deck-btn');
  if (btn) { btn.textContent = 'Building...'; btn.disabled = true; }

  try {
    state.deck = {};
    const ci = state.commander.color_identity || [];
    const spellCount = 99 - landCount;

    showToast('Fetching top-ranked cards...', 'info');
    const q = `commander:"${state.commander.name}" -t:land`;
    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
    const topCards = (data?.data || []).filter(c => c.id !== state.commander.id);
    topCards.filter(isColorLegal).slice(0, spellCount).forEach(card => { state.deck[card.id] = { card, qty: 1 }; });

    if (landCount === 0) {
      // Skip all lands
    } else if (fillSpecial) {
      const specialCount = landCount - basicCount;

      // Fetch non-basic lands first
      showToast(`Fetching ${specialCount} non-basic land(s)...`, 'info');
      const landQ = `commander:"${state.commander.name}" t:land -t:basic`;
      const landData = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(landQ)}&order=edhrec&unique=cards`);
      const nonbasics = (landData?.data || []).filter(c => isColorLegal(c));

      let added = 0;
      for (const card of nonbasics) {
        if (added >= specialCount) break;
        if (!state.deck[card.id]) { state.deck[card.id] = { card, qty: 1 }; added++; }
      }

      // Add basics to fill the rest
      if (basicCount > 0) {
        showToast(`Adding ${basicCount} basic land(s)...`, 'info');
        await addBasicLands(ci, basicCount);
      }
    } else {
      // Basics only
      showToast(`Adding ${basicCount} basic land(s)...`, 'info');
      await addBasicLands(ci, basicCount);
    }

    updateDeckUI();
    showToast(`Deck built! ${deckTotal()} cards + ${state.commander.name}`, 'success');
  } catch (e) {
    showToast('Failed to build deck', 'error');
    console.error(e);
  } finally {
    const b = document.getElementById('build-deck-btn');
    if (b) { b.textContent = 'Auto-Build Deck'; b.disabled = false; }
  }
}

async function makeCheaper(threshold) {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const btn = document.getElementById('budget-btn');
  if (btn) { btn.textContent = 'Working...'; btn.disabled = true; }

  try {
    // Find non-land cards above the price threshold
    const expensive = Object.values(state.deck)
      .filter(({ card }) => !isBasicLand(card) && (parseFloat(card.prices?.usd) || 0) > threshold)
      .sort((a, b) => (parseFloat(b.card.prices?.usd) || 0) - (parseFloat(a.card.prices?.usd) || 0));

    if (!expensive.length) {
      showToast(`No cards above $${threshold.toFixed(2)} in your deck!`, 'info');
      return;
    }

    showToast(`Finding budget replacements for ${expensive.length} card(s)...`, 'info');

    // Remove expensive cards
    const removedIds = new Set(expensive.map(({ card }) => card.id));
    expensive.forEach(({ card }) => delete state.deck[card.id]);

    // Fetch cheap commander-synergy cards under the threshold
    const q = `commander:"${state.commander.name}" usd<${threshold} -t:land`;
    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);

    if (!data || !data.data) {
      // Restore if fetch failed
      expensive.forEach(({ card, qty }) => { state.deck[card.id] = { card, qty }; });
      showToast('Could not fetch budget alternatives', 'error');
      return;
    }

    const deckIds = new Set(Object.keys(state.deck));
    const alternatives = data.data.filter(c =>
      !deckIds.has(c.id) &&
      !removedIds.has(c.id) &&
      isColorLegal(c) &&
      c.id !== state.commander.id
    );

    let added = 0;
    for (const card of alternatives) {
      if (added >= expensive.length) break;
      state.deck[card.id] = { card, qty: 1 };
      deckIds.add(card.id);
      added++;
    }

    updateDeckUI();
    const saved = expensive.reduce((s, { card }) => s + (parseFloat(card.prices?.usd) || 0), 0);
    showToast(`Replaced ${added} card(s) — saved ~$${saved.toFixed(2)}!`, 'success');
  } catch (e) {
    showToast('Budget swap failed', 'error');
    console.error(e);
  } finally {
    const b = document.getElementById('budget-btn');
    if (b) { b.textContent = 'Make it Cheaper'; b.disabled = false; }
  }
}

async function fillDeck() {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const remaining = deckLimit() - deckTotal();
  if (remaining <= 0) { showToast('Deck is already full!', 'info'); return; }

  const btn = document.getElementById('fill-deck-btn');
  if (btn) { btn.textContent = 'Finding cards...'; btn.disabled = true; }

  try {
    const budgetLabel = state.budgetThreshold ? ` under $${state.budgetThreshold}` : '';
    showToast(`Finding ${remaining} card(s)${budgetLabel}...`, 'info');
    let fillQ = `commander:"${state.commander.name}" -t:land`;
    if (state.budgetThreshold) fillQ += ` usd<${state.budgetThreshold}`;
    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(fillQ)}&order=edhrec&unique=cards`);

    const deckIds = new Set(Object.keys(state.deck));
    const candidates = (data?.data || []).filter(c =>
      !deckIds.has(c.id) && isColorLegal(c) && c.id !== state.commander.id
    );

    let added = 0;
    for (const card of candidates) {
      if (added >= remaining) break;
      state.deck[card.id] = { card, qty: 1 };
      added++;
    }

    updateDeckUI();
    showToast(`Added ${added} card(s)!`, 'success');
  } catch (e) {
    showToast('Failed to fetch cards', 'error');
    console.error(e);
  } finally {
    const b = document.getElementById('fill-deck-btn');
    if (b) { b.textContent = 'Fill Remaining Slots'; b.disabled = false; }
  }
}

async function showAlternatives(card) {
  const type = getType(card);
  const cmc  = card.cmc || 0;

  // Primary query: commander synergy + matching type (no CMC filter so pool is wide)
  let baseQ = `commander:"${state.commander.name}"`;
  if (type !== 'Land' && type !== 'Other') baseQ += ` t:${type.toLowerCase()}`;

  // Show modal immediately with loading state
  const wrap = document.createElement('div');
  const titleEl = document.createElement('h3');
  titleEl.textContent = `Alternatives for ${card.name}`;
  const loading = document.createElement('p');
  loading.textContent = 'Loading...';
  wrap.append(titleEl, loading);
  showModal(wrap);

  // State for pagination
  const shownIds = new Set([card.id, state.commander?.id].filter(Boolean));
  Object.keys(state.deck).forEach(id => shownIds.add(id));
  let nextUrl = null;
  let grid = null;
  let loadMoreBtn = null;
  let countEl = null;
  let totalShown = 0;

  const PAGE_SIZE = 10;

  function renderAltRow(alt) {
    shownIds.add(alt.id);
    totalShown++;

    const item = document.createElement('div');
    item.className = 'alt-item';

    const img = document.createElement('img');
    img.className = 'card-thumb';
    img.alt = alt.name;
    img.loading = 'lazy';
    const src = getImage(alt, 'small');
    if (src) img.src = src;

    const info = document.createElement('div');
    info.className = 'card-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'card-name';
    nameSpan.textContent = alt.name;

    const meta = document.createElement('span');
    meta.className = 'card-meta';
    meta.textContent = `${(alt.type_line || '').split('—')[0].trim()} • MV ${alt.cmc ?? '?'} • ${formatPrice(alt)}`;

    info.append(nameSpan, meta);

    if (isOwned(alt)) {
      const tag = document.createElement('span');
      tag.className = 'owned-badge alt-owned-tag';
      tag.textContent = `✓ Own ${ownedQty(alt)}×`;
      info.appendChild(tag);
    }

    const swapBtn = document.createElement('button');
    swapBtn.className = 'btn btn-sm btn-gold';
    swapBtn.textContent = 'Swap';
    swapBtn.addEventListener('click', () => {
      delete state.deck[card.id];
      state.deck[alt.id] = { card: alt, qty: 1 };
      updateDeckUI();
      hideModal();
      showToast(`${card.name} → ${alt.name}`, 'success');
    });

    item.append(img, info, swapBtn);
    item.addEventListener('mouseenter', e => showPreview(alt, e));
    item.addEventListener('mouseleave', hidePreview);
    item.addEventListener('mousemove', movePreview);
    return item;
  }

  async function fetchAndRender(url) {
    if (loadMoreBtn) { loadMoreBtn.disabled = true; loadMoreBtn.textContent = 'Loading...'; }

    try {
      const data = await apiGet(url);
      nextUrl = data?.has_more ? data.next_page : null;

      const fresh = (data?.data || []).filter(c => !shownIds.has(c.id) && isColorLegal(c));
      const page  = fresh.slice(0, PAGE_SIZE);
      page.forEach(alt => grid.insertBefore(renderAltRow(alt), loadMoreBtn));

      // Refresh count label
      if (countEl) countEl.textContent = `Showing ${totalShown} alternatives`;

      // Update / hide Load More button
      if (loadMoreBtn) {
        if (nextUrl) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = 'Load More';
        } else {
          loadMoreBtn.remove();
          loadMoreBtn = null;
        }
      }
    } catch (e) {
      if (loadMoreBtn) { loadMoreBtn.disabled = false; loadMoreBtn.textContent = 'Load More'; }
      showToast('Could not load more alternatives', 'error');
      console.error(e);
    }
  }

  // Build first page
  try {
    const firstUrl = `${SCRYFALL}/cards/search?q=${encodeURIComponent(baseQ)}&order=edhrec&unique=cards`;
    const data = await apiGet(firstUrl);
    nextUrl = data?.has_more ? data.next_page : null;

    const fresh = (data?.data || []).filter(c => !shownIds.has(c.id) && isColorLegal(c));
    const firstPage = fresh.slice(0, PAGE_SIZE);
    // Mark remainder of this Scryfall page as candidates for next "Load More"
    // but only ones we haven't seen — nextUrl handles the actual next API page

    wrap.innerHTML = '';
    wrap.appendChild(titleEl);

    const subtitle = document.createElement('p');
    subtitle.textContent = `${type} • MV ${cmc} • EDHRec synergy with ${state.commander.name}`;
    subtitle.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px;';
    wrap.appendChild(subtitle);

    countEl = document.createElement('p');
    countEl.style.cssText = 'font-size:0.78rem;color:var(--text-secondary);margin-bottom:6px;';
    wrap.appendChild(countEl);

    if (!firstPage.length) {
      const none = document.createElement('p');
      none.textContent = 'No alternatives found.';
      wrap.appendChild(none);
      return;
    }

    grid = document.createElement('div');
    grid.className = 'alt-grid';

    // Load More button lives at bottom of grid so insertBefore keeps rows above it
    loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'btn alt-load-more';
    loadMoreBtn.textContent = 'Load More';
    loadMoreBtn.addEventListener('click', () => { if (nextUrl) fetchAndRender(nextUrl); });
    grid.appendChild(loadMoreBtn);

    firstPage.forEach(alt => grid.insertBefore(renderAltRow(alt), loadMoreBtn));
    countEl.textContent = `Showing ${totalShown} alternatives`;

    if (!nextUrl) { loadMoreBtn.remove(); loadMoreBtn = null; }

    wrap.appendChild(grid);
  } catch (e) {
    wrap.innerHTML = '';
    wrap.appendChild(titleEl);
    const errMsg = document.createElement('p');
    errMsg.textContent = 'Could not fetch alternatives.';
    wrap.appendChild(errMsg);
    console.error(e);
  }
}

async function addBasicLands(colorIdentity, count) {
  const landMap = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
  const colors = colorIdentity.filter(c => landMap[c]);

  if (!colors.length) {
    // Colorless commanders get Wastes
    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent('!"Wastes" t:basic')}&unique=cards`);
    const wastes = data?.data?.[0];
    if (wastes) state.deck[wastes.id] = { card: wastes, qty: count };
    return;
  }

  // Single batch search for all needed basics
  const names = colors.map(c => landMap[c]);
  const q = `(${names.map(n => `!"${n}"`).join(' OR ')}) t:basic`;
  const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=cards`);

  const byName = {};
  (data?.data || []).forEach(card => { byName[card.name] = card; });

  const perColor = Math.floor(count / colors.length);
  const remainder = count % colors.length;

  colors.forEach((color, i) => {
    const card = byName[landMap[color]];
    if (card) state.deck[card.id] = { card, qty: perColor + (i < remainder ? 1 : 0) };
  });
}

// ==================== DECK MANAGEMENT ====================
function addCard(card) {
  const limit = deckLimit();
  if (deckTotal() >= limit) {
    const extra = state.commander ? ' (+ Commander)' : '';
    showToast(`Deck full! Max ${limit} cards${extra}.`, 'warn');
    return;
  }
  if (state.commander && card.id === state.commander.id) {
    showToast(`${card.name} is already your Commander`, 'warn');
    return;
  }
  if (!isColorLegal(card)) {
    const ci = (state.commander.color_identity || []).join('') || 'C';
    showToast(`${card.name} is outside ${state.commander.name}'s color identity (${ci})`, 'error');
    return;
  }
  const id = card.id;
  if (state.deck[id]) {
    if (state.format === 'commander' && !isBasicLand(card)) {
      showToast('Commander format: 1 copy max per card (except basic lands)', 'warn');
      return;
    }
    state.deck[id].qty++;
  } else {
    state.deck[id] = { card, qty: 1 };
  }
  updateDeckUI();
}

function removeOne(id) {
  if (!state.deck[id]) return;
  if (state.deck[id].qty <= 1) delete state.deck[id];
  else state.deck[id].qty--;
  updateDeckUI();
}

function removeAll(id) {
  delete state.deck[id];
  updateDeckUI();
}

function addOne(id) {
  if (!state.deck[id]) return;
  const { card } = state.deck[id];
  if (state.format === 'commander' && !isBasicLand(card)) {
    showToast('Commander format: 1 copy max per card', 'warn');
    return;
  }
  if (deckTotal() >= deckLimit()) {
    showToast('Deck is full!', 'warn');
    return;
  }
  state.deck[id].qty++;
  updateDeckUI();
}

// ==================== STATS ====================
function computeStats() {
  const curve = {};
  for (let i = 0; i <= 7; i++) curve[i] = 0;
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const types = {};
  let totalCmc = 0, nonLand = 0;

  const allEntries = [...Object.values(state.deck)];
  if (state.commander) allEntries.push({ card: state.commander, qty: 1 });

  for (const { card, qty } of allEntries) {
    const type = getType(card);
    types[type] = (types[type] || 0) + qty;

    const cardColors = card.colors || card.color_identity || [];
    if (cardColors.length === 0 && !type.includes('Land')) colors.C += qty;
    else cardColors.forEach(c => { if (colors[c] !== undefined) colors[c] += qty; });

    if (type !== 'Land') {
      const cmc = Math.min(7, Math.round(card.cmc || 0));
      curve[cmc] += qty;
      totalCmc += (card.cmc || 0) * qty;
      nonLand += qty;
    }
  }

  return {
    total: deckTotal() + (state.commander ? 1 : 0),
    avgCmc: nonLand ? (totalCmc / nonLand).toFixed(2) : '0.00',
    curve,
    colors,
    types,
  };
}

function drawManaCurve(stats) {
  const canvas = document.getElementById('mana-curve');
  const ctx = canvas.getContext('2d');
  const { curve } = stats;
  const W = canvas.width, H = canvas.height;
  const pad = { top: 12, right: 8, bottom: 28, left: 28 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const values = labels.map((_, i) => curve[i] || 0);
  const maxVal = Math.max(...values, 1);
  const barW = Math.floor(cW / labels.length) - 3;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + cH * (1 - i / 4);
    ctx.strokeStyle = '#2d3561';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#9aa3b8';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * i / 4), pad.left - 3, y + 3);
  }

  // Bars
  values.forEach((val, i) => {
    const barH = (val / maxVal) * cH;
    const x = pad.left + i * (cW / labels.length) + 2;
    const y = pad.top + cH - barH;

    const grad = ctx.createLinearGradient(x, y, x, y + barH);
    grad.addColorStop(0, '#c9a227');
    grad.addColorStop(1, '#5a4200');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = '#ccc';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW / 2, H - pad.bottom + 13);

    if (val > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.fillText(val, x + barW / 2, y - 2);
    }
  });
}

function renderColorDist(colors) {
  const el = document.getElementById('color-dist');
  el.innerHTML = '';
  const total = Object.values(colors).reduce((s, v) => s + v, 0) || 1;

  Object.entries(colors).forEach(([c, count]) => {
    if (!count) return;
    const row = document.createElement('div');
    row.className = 'dist-row';

    const label = document.createElement('span');
    label.className = 'dist-label';
    label.textContent = COLOR_NAMES[c];
    label.style.color = COLOR_HEX[c];

    const wrap = document.createElement('div');
    wrap.className = 'dist-bar-wrap';
    const fill = document.createElement('div');
    fill.className = 'dist-bar-fill';
    fill.style.width = `${(count / total * 100).toFixed(1)}%`;
    fill.style.backgroundColor = COLOR_HEX[c];
    wrap.appendChild(fill);

    const num = document.createElement('span');
    num.className = 'dist-num';
    num.textContent = count;

    row.append(label, wrap, num);
    el.appendChild(row);
  });
}

function renderTypeDist(types) {
  const el = document.getElementById('type-dist');
  el.innerHTML = '';
  const total = Object.values(types).reduce((s, v) => s + v, 0) || 1;

  TYPE_ORDER.filter(t => types[t]).forEach(type => {
    const count = types[type];
    const row = document.createElement('div');
    row.className = 'dist-row';

    const label = document.createElement('span');
    label.className = 'dist-label';
    label.textContent = type;

    const wrap = document.createElement('div');
    wrap.className = 'dist-bar-wrap';
    const fill = document.createElement('div');
    fill.className = 'dist-bar-fill';
    fill.style.width = `${(count / total * 100).toFixed(1)}%`;
    fill.style.backgroundColor = '#c9a227';
    wrap.appendChild(fill);

    const num = document.createElement('span');
    num.className = 'dist-num';
    num.textContent = count;

    row.append(label, wrap, num);
    el.appendChild(row);
  });
}

function computeCost() {
  let total = 0;
  for (const { card, qty } of Object.values(state.deck)) {
    total += (parseFloat(card.prices?.usd) || 0) * qty;
  }
  if (state.commander) total += parseFloat(state.commander.prices?.usd) || 0;
  return total;
}

function formatPrice(card, qty = 1) {
  const p = parseFloat(card.prices?.usd);
  if (!p) return '—';
  return qty > 1 ? `$${(p * qty).toFixed(2)}` : `$${p.toFixed(2)}`;
}

// ==================== COLLECTION ====================
function isOwned(card) {
  return card.name.toLowerCase() in state.collection;
}

function ownedQty(card) {
  return state.collection[card.name.toLowerCase()] || 0;
}

function parseCSVLine(line) {
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

function parseCollection(text) {
  const result = {};
  const lines = text.split('\n');
  if (!lines.length) return result;

  // Detect CSV by checking if first non-empty line has a column named "name"
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

  // Plain text: "4 Lightning Bolt", "4x Lightning Bolt", "Lightning Bolt x4", "Lightning Bolt"
  // Also handles "4 Lightning Bolt (XLN) 123" — strip set code + collector number
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

    // Strip "(SET) 123" collector info and "*F*" foil markers
    name = name.replace(/\s*\([A-Z0-9]{2,6}\)\s*\d*\s*$/, '').replace(/\s*\*F\*\s*$/, '').trim();
    if (name) result[name.toLowerCase()] = (result[name.toLowerCase()] || 0) + qty;
  }
  return result;
}

// ── Collection browser ──
const collectionCache = {}; // lowercase name -> card object | null
let hoverFetchTimer = null;

async function fetchCollectionCard(name) {
  const key = name.toLowerCase();
  if (key in collectionCache) return collectionCache[key];
  try {
    const data = await apiGet(`${SCRYFALL}/cards/named?exact=${encodeURIComponent(name)}`);
    collectionCache[key] = data || null;
  } catch { collectionCache[key] = null; }
  return collectionCache[key];
}

function showCollectionBrowser() {
  const ROWS_PER_PAGE = 60;
  let page = 0;
  let filterMode = 'all';   // 'all' | 'in-deck' | 'not-in-deck'
  let sortMode   = 'name';  // 'name' | 'qty'
  let query      = '';

  const deckNames = new Set(
    Object.values(state.deck).map(({ card }) => card.name.toLowerCase())
  );

  // Derive sorted+filtered list from state.collection
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

  // ── Build the modal ──
  const wrap = document.createElement('div');

  // Header
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

  // Controls
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

  // List container
  const listWrap = document.createElement('div');
  listWrap.className = 'coll-list';

  // Pagination bar
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

  // ── Render page ──
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
        // Capitalise first letter for display (storage is lowercase)
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

        // Hover → debounced preview fetch
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

    // Update pagination
    const start = list.length ? page * ROWS_PER_PAGE + 1 : 0;
    const end   = Math.min((page + 1) * ROWS_PER_PAGE, list.length);
    pageInfo.textContent = list.length ? `${start}–${end} of ${list.length.toLocaleString()}` : 'No results';
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= totalPages - 1;
  }

  // Wire controls
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

function saveCollection() {
  localStorage.setItem('mtg-collection', JSON.stringify(state.collection));
}

function loadCollection() {
  try {
    const raw = localStorage.getItem('mtg-collection');
    if (raw) state.collection = JSON.parse(raw);
  } catch { state.collection = {}; }
}

function showCollectionModal() {
  const collectionSize = Object.keys(state.collection).length;
  const wrap = document.createElement('div');

  const title = h('h3', collectionSize ? `My Collection (${collectionSize.toLocaleString()} unique cards)` : 'Upload My Collection');

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;';
  desc.innerHTML = 'Supports <strong>plain text</strong> (one card per line: <code>4 Lightning Bolt</code>) or <strong>CSV</strong> with a "Name" column (Moxfield, TCGPlayer, etc.).';

  // File drop zone
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

// ==================== TUNE DECK ====================
const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land'];

const STRATEGIES = {
  'Aggressive':      '(keyword:haste OR keyword:trample OR keyword:"first strike" OR keyword:"double strike" OR o:"whenever ~ attacks" OR o:"attacking creatures")',
  'Tokens / Swarm':  '(o:"create" o:"token" OR o:"put" o:"token onto")',
  'Card Draw':       '(o:"draw" o:"card" OR o:"draw two" OR o:"draw three")',
  'Removal':         '(o:destroy OR o:exile OR o:"deals damage to" o:target)',
  'Ramp / Mana':     '(o:"add {" OR t:ramp OR (t:artifact o:"add {"))',
  'Graveyard':       '(o:graveyard OR o:flashback OR o:"from your graveyard")',
  '+1/+1 Counters':  '(o:"+1/+1 counter")',
  'Sacrifice':       '(o:sacrifice OR o:"whenever a creature dies")',
  'Tribal Synergy':  '(o:"other" o:"get +"  OR o:"of the same type")',
  'Protection':      '(keyword:hexproof OR keyword:indestructible OR o:"protection from")',
};

function descriptionToQueryParts(text) {
  const t = text.toLowerCase();
  const parts = [];
  if (/aggro|attack|combat|haste|fast|offensive/.test(t))    parts.push(STRATEGIES['Aggressive']);
  if (/token|swarm|wide|many|army|flood/.test(t))            parts.push(STRATEGIES['Tokens / Swarm']);
  if (/draw|card advantage|cantrip|refill/.test(t))          parts.push(STRATEGIES['Card Draw']);
  if (/removal|destroy|exile|kill|wipe|board/.test(t))       parts.push(STRATEGIES['Removal']);
  if (/ramp|mana|accelerat|land|resource/.test(t))           parts.push(STRATEGIES['Ramp / Mana']);
  if (/grave|reanimat|recursion|death|return/.test(t))       parts.push(STRATEGIES['Graveyard']);
  if (/counter|buff|pump|\+1|grow/.test(t))                  parts.push(STRATEGIES['+1/+1 Counters']);
  if (/sacrifi|sac|drain|aristocrat|die/.test(t))            parts.push(STRATEGIES['Sacrifice']);
  if (/tribal|creature type|goblin|elf|human/.test(t))       parts.push(STRATEGIES['Tribal Synergy']);
  if (/protect|hexproof|indestructible|safe/.test(t))        parts.push(STRATEGIES['Protection']);
  return parts;
}

function showTuneDeckModal() {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const wrap = document.createElement('div');

  // ── Section 1: Rebalance ──
  const r1 = h('h3', 'Rebalance Card Types');
  const r2 = h('p', 'Swap out one card type for another using top EDHRec picks.');

  const rebalRow = document.createElement('div');
  rebalRow.className = 'tune-row';

  const addSel = makeTypeSelect('creature');
  const remSel = makeTypeSelect('artifact');
  const cntIn  = document.createElement('input');
  cntIn.type = 'number'; cntIn.min = '1'; cntIn.max = '20'; cntIn.value = '5';
  cntIn.style.cssText = 'width:52px;';

  rebalRow.append(lbl('Add more'), addSel, lbl('Remove'), remSel, lbl('Count'), cntIn);

  const rebalBtn = document.createElement('button');
  rebalBtn.className = 'btn btn-gold tune-full-btn';
  rebalBtn.textContent = 'Apply Rebalance';
  rebalBtn.addEventListener('click', () => {
    if (addSel.value === remSel.value) { showToast('Add and Remove types must differ', 'warn'); return; }
    hideModal();
    rebalanceTypes(addSel.value, remSel.value, parseInt(cntIn.value) || 5);
  });

  const sep = document.createElement('hr');
  sep.style.cssText = 'border-color:var(--border);margin:18px 0;';

  // ── Section 2: Strategy ──
  const s1 = h('h3', 'Strategy Focus');
  const s2 = h('p', 'Click strategies or describe your goal — the deck will be tuned toward those themes.');

  const chipWrap = document.createElement('div');
  chipWrap.className = 'strategy-presets';
  const active = new Set();

  Object.keys(STRATEGIES).forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'strategy-chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      active.has(name) ? active.delete(name) : active.add(name);
      chip.classList.toggle('active');
    });
    chipWrap.appendChild(chip);
  });

  const descLabel = lbl('Or describe your strategy:');
  descLabel.style.cssText = 'display:block;font-size:0.82rem;color:var(--text-secondary);margin:12px 0 5px;';
  const descIn = document.createElement('input');
  descIn.type = 'text';
  descIn.placeholder = 'e.g. attack heavy, plays well with goblins, go wide...';
  descIn.style.width = '100%';

  const swapLabel = lbl('Cards to swap if deck is full:');
  swapLabel.style.cssText = 'display:block;font-size:0.82rem;color:var(--text-secondary);margin:10px 0 5px;';
  const swapIn = document.createElement('input');
  swapIn.type = 'number'; swapIn.min = '1'; swapIn.max = '40'; swapIn.value = '10';
  swapIn.style.width = '100%';

  const stratBtn = document.createElement('button');
  stratBtn.className = 'btn btn-gold tune-full-btn';
  stratBtn.textContent = 'Apply Strategy';
  stratBtn.addEventListener('click', () => {
    const parts = [...active].map(n => STRATEGIES[n]);
    descriptionToQueryParts(descIn.value.trim()).forEach(p => { if (!parts.includes(p)) parts.push(p); });
    if (!parts.length) { showToast('Select a strategy or describe one', 'warn'); return; }
    hideModal();
    applyStrategy(parts, parseInt(swapIn.value) || 10);
  });

  wrap.append(r1, r2, rebalRow, rebalBtn, sep, s1, s2, chipWrap, descLabel, descIn, swapLabel, swapIn, stratBtn);
  showModal(wrap);
}

// DOM helpers for the modal
function h(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
function lbl(text)    { const el = document.createElement('label'); el.textContent = text; return el; }
function makeTypeSelect(defaultVal) {
  const sel = document.createElement('select');
  CARD_TYPES.forEach(t => {
    const o = document.createElement('option');
    o.value = t.toLowerCase(); o.textContent = t + 's';
    sel.appendChild(o);
  });
  sel.value = defaultVal;
  return sel;
}

async function rebalanceTypes(addType, removeType, count) {
  try {
    // Remove cheapest N of removeType (most expendable)
    const toRemove = Object.values(state.deck)
      .filter(({ card }) => getType(card).toLowerCase() === removeType && !isBasicLand(card))
      .sort((a, b) => (parseFloat(a.card.prices?.usd) || 0) - (parseFloat(b.card.prices?.usd) || 0))
      .slice(0, count);

    if (!toRemove.length) { showToast(`No ${removeType}s in deck to remove`, 'warn'); return; }

    showToast(`Swapping ${toRemove.length} ${removeType}(s) → ${addType}(s)...`, 'info');

    const removedIds = new Set(toRemove.map(({ card }) => card.id));
    toRemove.forEach(({ card }) => delete state.deck[card.id]);

    let q = `commander:"${state.commander.name}" t:${addType}`;
    if (addType !== 'land') q += ' -t:land';
    if (state.budgetThreshold) q += ` usd<${state.budgetThreshold}`;

    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
    const deckIds = new Set(Object.keys(state.deck));
    const picks = (data?.data || []).filter(c =>
      !deckIds.has(c.id) && !removedIds.has(c.id) && isColorLegal(c) && c.id !== state.commander?.id
    );

    let added = 0;
    for (const card of picks) {
      if (added >= toRemove.length) break;
      state.deck[card.id] = { card, qty: 1 };
      added++;
    }

    updateDeckUI();
    showToast(`Replaced ${toRemove.length} ${removeType}(s) with ${added} ${addType}(s)!`, 'success');
  } catch (e) { showToast('Rebalance failed', 'error'); console.error(e); }
}

async function applyStrategy(queryParts, swapCount) {
  try {
    showToast('Finding strategy-focused cards...', 'info');

    const strategyFilter = `(${queryParts.join(' OR ')})`;
    let q = `commander:"${state.commander.name}" -t:land ${strategyFilter}`;
    if (state.budgetThreshold) q += ` usd<${state.budgetThreshold}`;

    let data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);

    // Fallback: drop the commander: filter if it returns nothing
    if (!data || !data.data || !data.data.length) {
      const ci = (state.commander.color_identity || []).join('') || 'C';
      let fallbackQ = `color<=${ci} -t:land ${strategyFilter}`;
      if (state.budgetThreshold) fallbackQ += ` usd<${state.budgetThreshold}`;
      data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(fallbackQ)}&order=edhrec&unique=cards`);
    }

    const deckIds = new Set(Object.keys(state.deck));
    const candidates = (data?.data || []).filter(c =>
      !deckIds.has(c.id) && isColorLegal(c) && c.id !== state.commander?.id
    );

    if (!candidates.length) { showToast('No strategy cards found — try different keywords', 'warn'); return; }

    // Make room if deck is full — never remove lands
    const remaining = deckLimit() - deckTotal();
    let removed = 0;
    if (remaining < candidates.length && swapCount > 0) {
      const toRemove = Object.values(state.deck)
        .filter(({ card }) => getType(card) !== 'Land')
        .sort((a, b) => (parseFloat(a.card.prices?.usd) || 0) - (parseFloat(b.card.prices?.usd) || 0))
        .slice(0, Math.min(swapCount, candidates.length));
      toRemove.forEach(({ card }) => { delete state.deck[card.id]; deckIds.delete(card.id); removed++; });
    }

    let added = 0;
    const slots = deckLimit() - deckTotal();
    for (const card of candidates) {
      if (added >= slots) break;
      if (!state.deck[card.id]) { state.deck[card.id] = { card, qty: 1 }; added++; }
    }

    updateDeckUI();
    showToast(`Added ${added} strategy card(s)${removed ? `, replaced ${removed}` : ''}!`, 'success');
  } catch (e) { showToast('Strategy failed', 'error'); console.error(e); }
}

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

function makeDeckRow(card, qty) {
  const row = document.createElement('div');
  row.className = 'deck-row';

  const qtyCtrl = document.createElement('div');
  qtyCtrl.className = 'qty-controls';

  const minus = document.createElement('button');
  minus.className = 'btn btn-xs';
  minus.textContent = '-';
  minus.addEventListener('click', () => removeOne(card.id));

  const qtyNum = document.createElement('span');
  qtyNum.className = 'qty-num';
  qtyNum.textContent = qty;

  const plus = document.createElement('button');
  plus.className = 'btn btn-xs';
  plus.textContent = '+';
  plus.addEventListener('click', () => addOne(card.id));

  const del = document.createElement('button');
  del.className = 'btn btn-xs btn-danger';
  del.textContent = 'x';
  del.title = 'Remove all copies';
  del.addEventListener('click', () => removeAll(card.id));

  qtyCtrl.append(minus, qtyNum, plus, del);

  const rarityDot = document.createElement('span');
  rarityDot.className = `rarity-dot rarity-${card.rarity || 'common'}`;
  rarityDot.title = card.rarity || 'common';

  const nameEl = document.createElement('span');
  nameEl.className = state.commander ? 'deck-card-name deck-card-link' : 'deck-card-name';
  nameEl.textContent = card.name;
  nameEl.title = state.commander ? 'Click for alternatives' : '';
  if (state.commander) nameEl.addEventListener('click', e => { e.stopPropagation(); showAlternatives(card); });

  const owned = isOwned(card);
  const ownedBadge = document.createElement('span');
  if (owned) {
    ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = '✓';
    ownedBadge.title = `In your collection (${ownedQty(card)}×)`;
  }

  const banned = isBannedInFormat(card);
  const bannedBadge = document.createElement('span');
  if (banned) {
    bannedBadge.className = 'banned-badge';
    bannedBadge.textContent = 'BANNED';
    bannedBadge.title = `Banned in ${state.format}`;
  }

  const priceEl = document.createElement('span');
  priceEl.className = 'deck-card-price';
  priceEl.textContent = formatPrice(card, qty);

  const cmcEl = document.createElement('span');
  cmcEl.className = 'deck-card-cmc';
  cmcEl.textContent = card.cmc > 0 ? card.cmc : '';

  row.append(qtyCtrl, rarityDot, nameEl, owned ? ownedBadge : '', banned ? bannedBadge : '', priceEl, cmcEl);
  row.addEventListener('mouseenter', e => showPreview(card, e));
  row.addEventListener('mouseleave', hidePreview);
  row.addEventListener('mousemove', movePreview);
  return row;
}

// ==================== FORMAT BAN CHECKER ====================
function isBannedInFormat(card) {
  if (!card.legalities) return false;
  const status = card.legalities[state.format];
  return status === 'banned' || status === 'restricted';
}

// ==================== BUY LIST ====================
function showBuyListModal() {
  const hasCollection = Object.keys(state.collection).length > 0;

  // Cards needed: in deck but not owned (or owned fewer than qty)
  const needed = Object.values(state.deck)
    .filter(({ card }) => !isBasicLand(card))
    .map(({ card, qty }) => {
      const owned = state.collection[card.name.toLowerCase()] || 0;
      const toBuy = Math.max(0, qty - owned);
      return { card, qty, owned, toBuy };
    })
    .filter(r => !hasCollection || r.toBuy > 0)
    .sort((a, b) => (parseFloat(b.card.prices?.usd) || 0) - (parseFloat(a.card.prices?.usd) || 0));

  const totalCost = needed.reduce((s, { card, toBuy }) =>
    s + (parseFloat(card.prices?.usd) || 0) * toBuy, 0);

  const wrap = document.createElement('div');

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:baseline;gap:10px;margin-bottom:6px;';
  const titleEl = h('h3', hasCollection ? 'Cards to Acquire' : 'Full Deck Buy List');
  titleEl.style.margin = '0';
  const costBadge = document.createElement('span');
  costBadge.style.cssText = 'font-size:0.9rem;color:var(--gold-light);font-weight:700;';
  costBadge.textContent = `$${totalCost.toFixed(2)}`;
  titleRow.append(titleEl, costBadge);

  const desc = document.createElement('p');
  desc.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-bottom:10px;';
  desc.textContent = hasCollection
    ? `${needed.length} card(s) you don't own yet · prices via Scryfall/TCGPlayer`
    : `${needed.length} non-land cards · upload your collection to see what you already own`;

  const list = document.createElement('div');
  list.className = 'buy-list';

  if (!needed.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#4ade80;font-size:0.85rem;padding:8px 0;';
    empty.textContent = hasCollection
      ? 'You own every card in this deck!' : 'No non-land cards in deck.';
    list.appendChild(empty);
  } else {
    needed.forEach(({ card, toBuy }) => {
      const row = document.createElement('div');
      row.className = 'buy-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'buy-name';
      nameSpan.textContent = card.name;

      const qtySpan = document.createElement('span');
      qtySpan.className = 'buy-qty';
      qtySpan.textContent = `×${toBuy}`;

      const priceSpan = document.createElement('span');
      priceSpan.className = 'buy-price';
      const usd = parseFloat(card.prices?.usd) || 0;
      priceSpan.textContent = usd ? `$${(usd * toBuy).toFixed(2)}` : '—';

      const buyLink = document.createElement('a');
      buyLink.className = 'btn btn-xs btn-gold buy-link';
      buyLink.textContent = 'Buy';
      buyLink.target = '_blank';
      buyLink.rel = 'noopener';
      buyLink.href = card.purchase_uris?.tcgplayer ||
        `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`;

      row.append(nameSpan, qtySpan, priceSpan, buyLink);

      row.addEventListener('mouseenter', e => showPreview(card, e));
      row.addEventListener('mouseleave', hidePreview);
      row.addEventListener('mousemove', movePreview);

      list.appendChild(row);
    });
  }

  // Copy list button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn tune-full-btn';
  copyBtn.textContent = 'Copy as Text';
  copyBtn.style.marginTop = '10px';
  copyBtn.addEventListener('click', () => {
    const text = needed.map(({ card, toBuy }) =>
      `${toBuy}x ${card.name}  $${((parseFloat(card.prices?.usd) || 0) * toBuy).toFixed(2)}`
    ).join('\n') + `\n\nTotal: $${totalCost.toFixed(2)}`;
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
  });

  wrap.append(titleRow, desc, list, copyBtn);
  showModal(wrap);
}

// ==================== PLAYTEST ====================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showPlaytestModal() {
  if (!Object.keys(state.deck).length) { showToast('Add cards to the deck first', 'warn'); return; }

  const allCards = [];
  Object.values(state.deck).forEach(({ card, qty }) => {
    for (let i = 0; i < qty; i++) allCards.push(card);
  });

  // Zone state
  let library = [], hand = [], battlefield = [], graveyard = [], exile = [];
  let turn = 0, mulliganSize = 7;
  let selectedHandIdx = -1;
  let tokens = 0;
  let cmdOnBattlefield = false;
  let cmdTax = 0; // times commander was cast from command zone

  // ── Actions ──
  function newGame() {
    library = shuffle(allCards);
    hand = []; battlefield = []; graveyard = []; exile = [];
    turn = 1; mulliganSize = 7; selectedHandIdx = -1; tokens = 0;
    cmdOnBattlefield = false; cmdTax = 0;
    hand.push(...library.splice(0, 7));
    render();
  }

  function castCommander() {
    cmdOnBattlefield = true;
    cmdTax++;
    render();
  }

  function returnCmdToZone() {
    cmdOnBattlefield = false;
    render();
  }

  function endTurn() {
    // Untap all, draw one, advance turn
    battlefield.forEach(b => { b.tapped = false; });
    if (library.length) hand.push(...library.splice(0, 1));
    turn++;
    selectedHandIdx = -1;
    render();
  }

  function doMulligan() {
    mulliganSize = Math.max(0, mulliganSize - 1);
    library = shuffle([...hand, ...library]);
    hand = []; selectedHandIdx = -1;
    hand.push(...library.splice(0, mulliganSize));
    render();
  }

  function playCard(idx) {
    battlefield.push({ card: hand.splice(idx, 1)[0], tapped: false });
    selectedHandIdx = -1;
    render();
  }

  function discardCard(idx) {
    graveyard.push(hand.splice(idx, 1)[0]);
    selectedHandIdx = -1;
    render();
  }

  function exileCard(idx) {
    exile.push(hand.splice(idx, 1)[0]);
    selectedHandIdx = -1;
    render();
  }

  // ── Modal DOM shell ──
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('playtest-fullscreen');
  const modalEl = overlay.querySelector('.modal');
  modalEl.classList.add('modal-playtest');
  const contentEl = document.getElementById('modal-content');
  contentEl.innerHTML = '';

  // cleanup on close
  const origClose = () => {
    overlay.classList.remove('playtest-fullscreen');
    modalEl.classList.remove('modal-playtest');
  };
  document.getElementById('modal-close').addEventListener('click', origClose, { once: true });
  overlay.addEventListener('click', e => {
    if (e.target === overlay) origClose();
  }, { once: true });

  // Top bar
  const topBar = document.createElement('div');
  topBar.className = 'playtest-topbar';

  const newGameBtn = document.createElement('button');
  newGameBtn.className = 'btn btn-xs btn-gold';
  newGameBtn.textContent = 'New Game';
  newGameBtn.addEventListener('click', newGame);

  const mulliganBtn = document.createElement('button');
  mulliganBtn.className = 'btn btn-xs';
  mulliganBtn.addEventListener('click', doMulligan);

  const endTurnBtn = document.createElement('button');
  endTurnBtn.className = 'btn btn-xs btn-playtest';
  endTurnBtn.textContent = 'End Turn / Draw';
  endTurnBtn.addEventListener('click', endTurn);

  const turnBadge = document.createElement('span');
  const libBadge  = document.createElement('span');

  // Token counter
  const tokenWrap = document.createElement('span');
  tokenWrap.className = 'playtest-badge';
  tokenWrap.style.display = 'flex';
  tokenWrap.style.gap = '4px';
  tokenWrap.style.alignItems = 'center';
  const tokenMinus = document.createElement('button');
  tokenMinus.className = 'btn btn-xs';
  tokenMinus.textContent = '−';
  tokenMinus.addEventListener('click', () => { tokens = Math.max(0, tokens - 1); renderBadges(); });
  const tokenLabel = document.createElement('span');
  const tokenPlus = document.createElement('button');
  tokenPlus.className = 'btn btn-xs';
  tokenPlus.textContent = '+';
  tokenPlus.addEventListener('click', () => { tokens++; renderBadges(); });
  tokenWrap.append(tokenMinus, tokenLabel, tokenPlus);

  topBar.append(newGameBtn, mulliganBtn, endTurnBtn, turnBadge, libBadge, tokenWrap);

  // Commander zone
  const cmdStrip = document.createElement('div');
  cmdStrip.className = 'playtest-cmd';

  // Zones
  const bfZone  = makeZone('Battlefield', 'battlefield-zone');
  const handZone = makeZone('Hand', 'hand-zone');
  const gyZone  = makeZone('Graveyard', 'gy-zone');
  const exZone  = makeZone('Exile', 'ex-zone');

  function makeZone(label, cls) {
    const z = document.createElement('div');
    z.className = `playtest-zone ${cls}`;
    const lbl = document.createElement('div');
    lbl.className = 'playtest-zone-label';
    lbl.textContent = label;
    const cards = document.createElement('div');
    cards.className = 'playtest-cards';
    z.append(lbl, cards);
    z._label = lbl;
    z._cards = cards;
    return z;
  }

  const bottomRow = document.createElement('div');
  bottomRow.className = 'playtest-bottom';
  bottomRow.append(gyZone, exZone);

  contentEl.append(topBar, cmdStrip, bfZone, handZone, bottomRow);

  // ── Render ──
  function renderBadges() {
    mulliganBtn.textContent = `Mulligan → ${mulliganSize - 1}`;
    mulliganBtn.disabled = turn > 1;
    turnBadge.className = 'playtest-badge';
    turnBadge.textContent = `Turn ${turn}`;
    libBadge.className = 'playtest-badge';
    libBadge.textContent = `Library: ${library.length}`;
    tokenLabel.textContent = `Tokens: ${tokens}`;
  }

  function makeThumb(card, onClick, extraClass = '') {
    const el = document.createElement('div');
    el.className = `playtest-card ${extraClass}`;
    const img = document.createElement('img');
    img.className = 'playtest-thumb';
    img.src = getImage(card, 'small') || '';
    img.alt = card.name;
    img.loading = 'lazy';
    const nm = document.createElement('span');
    nm.className = 'playtest-card-name';
    nm.textContent = card.name;
    el.append(img, nm);
    if (onClick) el.addEventListener('click', onClick);
    el.addEventListener('mouseenter', e => showPreview(card, e));
    el.addEventListener('mouseleave', hidePreview);
    el.addEventListener('mousemove', movePreview);
    return el;
  }

  function render() {
    renderBadges();

    // Commander zone
    cmdStrip.innerHTML = '';
    if (state.commander) {
      const cmdLabel = document.createElement('span');
      cmdLabel.className = 'playtest-zone-label';
      cmdLabel.textContent = 'Command Zone';

      if (cmdOnBattlefield) {
        // Show a "on battlefield" placeholder in the command zone
        const awayNote = document.createElement('span');
        awayNote.className = 'cmd-away-note';
        awayNote.textContent = `${state.commander.name} is on the battlefield`;
        cmdStrip.append(cmdLabel, awayNote);
      } else {
        // Commander is in command zone — show card + Cast button
        const cmdCard = document.createElement('div');
        cmdCard.className = 'playtest-card cmd-zone-card';

        const img = document.createElement('img');
        img.className = 'playtest-thumb';
        img.src = getImage(state.commander, 'small') || '';
        img.alt = state.commander.name;
        img.addEventListener('mouseenter', e => showPreview(state.commander, e));
        img.addEventListener('mouseleave', hidePreview);
        img.addEventListener('mousemove', movePreview);

        const castBtn = document.createElement('button');
        castBtn.className = 'btn btn-xs btn-gold cmd-cast-btn';
        castBtn.textContent = cmdTax > 0 ? `Cast (+${cmdTax * 2} tax)` : 'Cast';
        castBtn.title = cmdTax > 0
          ? `Commander tax: costs ${cmdTax * 2} additional generic mana`
          : 'Play commander onto the battlefield';
        castBtn.addEventListener('click', castCommander);

        cmdCard.append(img, castBtn);
        cmdStrip.append(cmdLabel, cmdCard);
      }
    }

    // Battlefield
    // Add commander to battlefield display if on battlefield
    const bfDisplay = [...battlefield];
    if (cmdOnBattlefield) bfDisplay.unshift({ card: state.commander, tapped: false, isCommander: true });

    bfZone._label.textContent = `Battlefield — ${bfDisplay.length} permanent(s)  ·  click to tap/untap  ·  double-click to remove`;
    bfZone._cards.innerHTML = '';
    bfDisplay.forEach((entry, idx) => {
      const isCmd = entry.isCommander;
      const el = makeThumb(entry.card, () => {
        entry.tapped = !entry.tapped;
        el.classList.toggle('tapped', entry.tapped);
      }, (entry.tapped ? 'tapped ' : '') + (isCmd ? 'cmd-on-battlefield' : ''));

      el.addEventListener('dblclick', e => {
        e.stopPropagation();
        if (isCmd) {
          // Commander goes back to command zone
          returnCmdToZone();
        } else {
          // Regular permanent goes to graveyard
          graveyard.push(battlefield.splice(idx - (cmdOnBattlefield ? 1 : 0), 1)[0].card);
          render();
        }
      });

      if (isCmd) {
        const cmdTag = document.createElement('span');
        cmdTag.className = 'cmd-battlefield-tag';
        cmdTag.textContent = 'Commander';
        el.appendChild(cmdTag);
      }

      bfZone._cards.appendChild(el);
    });

    // Hand
    handZone._label.textContent = `Hand — ${hand.length} card(s)  ·  click to select, then choose action`;
    handZone._cards.innerHTML = '';

    hand.forEach((card, idx) => {
      const isSelected = idx === selectedHandIdx;
      const el = makeThumb(card, () => {
        selectedHandIdx = isSelected ? -1 : idx;
        render();
      }, isSelected ? 'selected' : '');

      if (isSelected) {
        // Action buttons overlay
        const actions = document.createElement('div');
        actions.className = 'hand-card-actions';

        const playBtn = document.createElement('button');
        playBtn.className = 'btn btn-xs btn-gold';
        playBtn.textContent = 'Play';
        playBtn.addEventListener('click', e => { e.stopPropagation(); playCard(idx); });

        const discBtn = document.createElement('button');
        discBtn.className = 'btn btn-xs';
        discBtn.textContent = 'Discard';
        discBtn.addEventListener('click', e => { e.stopPropagation(); discardCard(idx); });

        const exBtn = document.createElement('button');
        exBtn.className = 'btn btn-xs';
        exBtn.textContent = 'Exile';
        exBtn.addEventListener('click', e => { e.stopPropagation(); exileCard(idx); });

        actions.append(playBtn, discBtn, exBtn);
        el.appendChild(actions);
      }

      handZone._cards.appendChild(el);
    });

    // Graveyard
    gyZone._label.textContent = `Graveyard (${graveyard.length})  ·  click to return to hand`;
    gyZone._cards.innerHTML = '';
    graveyard.slice().reverse().forEach((card, ri) => {
      const idx = graveyard.length - 1 - ri;
      gyZone._cards.appendChild(makeThumb(card, () => {
        hand.push(graveyard.splice(idx, 1)[0]);
        render();
      }));
    });

    // Exile
    exZone._label.textContent = `Exile (${exile.length})`;
    exZone._cards.innerHTML = '';
    exile.forEach(card => exZone._cards.appendChild(makeThumb(card, null)));
  }

  newGame();
}

// ==================== RENDER ====================
function renderSearch(cards) {
  const el = document.getElementById('search-results');
  el.innerHTML = '';
  if (!cards.length) { el.innerHTML = '<p class="no-results">No cards found.</p>'; return; }
  cards.forEach(card => el.appendChild(makeCardEl(card)));
}

function renderSuggestions(cards) {
  const el = document.getElementById('suggestions-list');
  el.innerHTML = '';
  if (!cards.length) { el.innerHTML = '<p class="no-results">No suggestions found.</p>'; return; }
  cards.forEach(card => el.appendChild(makeCardEl(card)));
}

function makeCardEl(card) {
  const el = document.createElement('div');
  const legal = isColorLegal(card);
  el.className = legal ? 'card-item' : 'card-item card-illegal';

  const img = document.createElement('img');
  img.className = 'card-thumb';
  img.alt = card.name;
  img.loading = 'lazy';
  const src = getImage(card, 'small');
  if (src) img.src = src;

  const info = document.createElement('div');
  info.className = 'card-info';

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = card.name;

  const meta = document.createElement('span');
  meta.className = 'card-meta';
  meta.textContent = `${(card.type_line || '').split('—')[0].trim()} • MV ${card.cmc ?? '?'}`;

  info.append(name, meta);

  const add = document.createElement('button');
  add.className = 'btn btn-sm btn-gold add-btn';
  add.textContent = '+';
  add.title = legal ? 'Add to deck' : 'Outside commander color identity';
  add.disabled = !legal;
  add.addEventListener('click', e => { e.stopPropagation(); addCard(card); });

  el.append(img, info);
  if (isLegendary(card)) {
    const crown = document.createElement('button');
    crown.className = 'btn btn-xs crown-btn';
    crown.textContent = '♛';
    crown.title = 'Set as Commander';
    crown.addEventListener('click', e => { e.stopPropagation(); setCommander(card); });
    el.appendChild(crown);
  }
  el.appendChild(add);
  el.addEventListener('mouseenter', e => showPreview(card, e));
  el.addEventListener('mouseleave', hidePreview);
  el.addEventListener('mousemove', movePreview);
  return el;
}

function renderDeck() {
  const container = document.getElementById('deck-list');
  container.innerHTML = '';
  const stats = computeStats();
  const limit = FORMAT_LIMITS[state.format];

  document.getElementById('card-count').textContent = `${stats.total} / ${limit}`;
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-avg-cmc').textContent = stats.avgCmc;
  const statCostEl = document.getElementById('stat-cost');
  if (statCostEl) statCostEl.textContent = `$${computeCost().toFixed(2)}`;

  const statOwnedEl = document.getElementById('stat-owned');
  if (statOwnedEl) {
    const hasCollection = Object.keys(state.collection).length > 0;
    if (hasCollection) {
      const nonLand = Object.values(state.deck).filter(({ card }) => !isBasicLand(card));
      const ownedCount = nonLand.filter(({ card }) => isOwned(card)).length;
      const total = nonLand.length;
      statOwnedEl.textContent = `${ownedCount} / ${total}`;
      statOwnedEl.style.color = ownedCount === total ? '#4ade80' : 'var(--gold-light)';
    } else {
      statOwnedEl.textContent = '—';
      statOwnedEl.style.color = '';
    }
  }

  const statIllegalEl = document.getElementById('stat-illegal');
  if (statIllegalEl) {
    const bannedCards = Object.values(state.deck).filter(({ card }) => isBannedInFormat(card));
    if (bannedCards.length) {
      statIllegalEl.textContent = `${bannedCards.length} banned`;
      statIllegalEl.style.color = '#f87171';
    } else {
      statIllegalEl.textContent = '✓ Legal';
      statIllegalEl.style.color = '#4ade80';
    }
  }

  // Commander zone
  if (state.commander) {
    const zone = document.createElement('div');
    zone.className = 'commander-zone';

    const zoneHeader = document.createElement('div');
    zoneHeader.className = 'deck-section-header commander-header';
    zoneHeader.textContent = 'Commander';

    const cmdRow = document.createElement('div');
    cmdRow.className = 'deck-row';

    const cmdImg = document.createElement('img');
    cmdImg.className = 'card-thumb';
    cmdImg.alt = state.commander.name;
    const cmdSrc = getImage(state.commander, 'small');
    if (cmdSrc) cmdImg.src = cmdSrc;

    const cmdName = document.createElement('span');
    cmdName.className = 'deck-card-name commander-name';
    cmdName.textContent = state.commander.name;

    const cmdRemove = document.createElement('button');
    cmdRemove.className = 'btn btn-xs btn-danger';
    cmdRemove.textContent = 'x';
    cmdRemove.title = 'Remove Commander';
    cmdRemove.addEventListener('click', () => { state.commander = null; updateDeckUI(); });

    const cmdPrice = document.createElement('span');
    cmdPrice.className = 'deck-card-price';
    cmdPrice.textContent = formatPrice(state.commander);

    cmdRow.append(cmdImg, cmdName, cmdPrice, cmdRemove);
    cmdRow.addEventListener('mouseenter', e => showPreview(state.commander, e));
    cmdRow.addEventListener('mouseleave', hidePreview);
    cmdRow.addEventListener('mousemove', movePreview);

    // ── Auto-Build (primary action) ──
    const buildWrap = document.createElement('div');
    buildWrap.className = 'cmd-action-primary';

    const buildBtn = document.createElement('button');
    buildBtn.id = 'build-deck-btn';
    buildBtn.className = 'btn btn-gold cmd-action-btn';
    buildBtn.textContent = '✦ Auto-Build Full Deck';
    buildBtn.addEventListener('click', showBuildDeckModal);

    const buildDesc = document.createElement('p');
    buildDesc.className = 'cmd-action-desc';
    buildDesc.textContent = 'Clears the deck and builds 99 cards from scratch using EDHRec synergy for your commander.';

    buildWrap.append(buildBtn, buildDesc);

    // ── Divider ──
    const divider = document.createElement('div');
    divider.className = 'cmd-action-divider';
    divider.innerHTML = '<span>or, if deck already has cards</span>';

    // ── Fill Remaining (secondary action) ──
    const fillWrap = document.createElement('div');
    fillWrap.className = 'cmd-action-secondary';

    const fillBtn = document.createElement('button');
    fillBtn.id = 'fill-deck-btn';
    fillBtn.className = 'btn cmd-action-btn';
    const remaining = deckLimit() - deckTotal();
    const bLabel = state.budgetThreshold ? ` ≤$${state.budgetThreshold}` : '';
    fillBtn.textContent = remaining > 0 ? `Fill Remaining Slots${bLabel} (${remaining})` : 'Deck Full';
    fillBtn.disabled = remaining <= 0;
    fillBtn.addEventListener('click', fillDeck);

    const fillDesc = document.createElement('p');
    fillDesc.className = 'cmd-action-desc';
    fillDesc.textContent = 'Keeps your current cards and fills empty slots with synergy picks.';

    fillWrap.append(fillBtn, fillDesc);

    zone.append(zoneHeader, cmdRow, buildWrap, divider, fillWrap);
    container.appendChild(zone);
  }

  const allCards = Object.values(state.deck);

  if (!allCards.length) {
    const empty = document.createElement('p');
    empty.className = 'no-results';
    empty.innerHTML = 'Your deck is empty.<br>Search for cards and click + to add them.';
    container.appendChild(empty);
  } else if (state.deckSort === 'type') {
    const groups = {};
    for (const { card, qty } of allCards) {
      const t = getType(card);
      (groups[t] = groups[t] || []).push({ card, qty });
    }
    TYPE_ORDER.filter(t => groups[t]).forEach(type => {
      const cards = groups[type].sort((a, b) => a.card.name.localeCompare(b.card.name));
      const sectionTotal = cards.reduce((s, { qty }) => s + qty, 0);
      const section = document.createElement('div');
      section.className = 'deck-section';
      const header = document.createElement('div');
      header.className = 'deck-section-header';
      header.textContent = `${type} (${sectionTotal})`;
      section.appendChild(header);
      cards.forEach(({ card, qty }) => section.appendChild(makeDeckRow(card, qty)));
      container.appendChild(section);
    });
  } else {
    const sorted = [...allCards].sort((a, b) => {
      switch (state.deckSort) {
        case 'name':   return a.card.name.localeCompare(b.card.name);
        case 'cmc':    return (a.card.cmc || 0) - (b.card.cmc || 0) || a.card.name.localeCompare(b.card.name);
        case 'price':  return (parseFloat(b.card.prices?.usd) || 0) - (parseFloat(a.card.prices?.usd) || 0);
        case 'rarity': return (RARITY_ORDER[b.card.rarity] || 0) - (RARITY_ORDER[a.card.rarity] || 0) || a.card.name.localeCompare(b.card.name);
        default:       return 0;
      }
    });
    const section = document.createElement('div');
    section.className = 'deck-section';
    sorted.forEach(({ card, qty }) => section.appendChild(makeDeckRow(card, qty)));
    container.appendChild(section);
  }

  drawManaCurve(stats);
  renderColorDist(stats.colors);
  renderTypeDist(stats.types);
}

function updateDeckUI() {
  renderDeck();
  autoSave();
}

// ==================== PREVIEW ====================
let previewTimer;

function showPreview(card, e) {
  clearTimeout(previewTimer);
  const img = document.getElementById('preview-img');
  const src = getImage(card, 'normal');
  if (!src) return;
  img.src = src;
  const preview = document.getElementById('card-preview');
  preview.classList.add('visible');
  movePreview(e);
}

function hidePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    document.getElementById('card-preview').classList.remove('visible');
  }, 80);
}

function movePreview(e) {
  const preview = document.getElementById('card-preview');
  const pw = 250, ph = 350;
  let x = e.clientX + 14;
  let y = e.clientY - ph / 2;
  if (x + pw > window.innerWidth - 10)  x = e.clientX - pw - 14;
  if (y < 5) y = 5;
  if (y + ph > window.innerHeight - 5) y = window.innerHeight - ph - 5;
  preview.style.left = `${x}px`;
  preview.style.top  = `${y}px`;
}

// ==================== MODAL ====================
function showModal(node) {
  const content = document.getElementById('modal-content');
  content.innerHTML = '';
  if (typeof node === 'string') content.innerHTML = node;
  else content.appendChild(node);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ==================== TOASTS ====================
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

// ==================== STORAGE ====================
function saveDeck(name) {
  const decks = JSON.parse(localStorage.getItem('mtg-decks') || '{}');
  decks[name] = {
    format: state.format,
    commander: state.commander || null,
    cards: Object.values(state.deck).map(({ card, qty }) => ({ card, qty })),
    notes: state.deckNotes || '',
  };
  localStorage.setItem('mtg-decks', JSON.stringify(decks));
}

function loadDeckByName(name) {
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

function deleteSavedDeck(name) {
  const decks = JSON.parse(localStorage.getItem('mtg-decks') || '{}');
  delete decks[name];
  localStorage.setItem('mtg-decks', JSON.stringify(decks));
}

function savedDeckNames() {
  return Object.keys(JSON.parse(localStorage.getItem('mtg-decks') || '{}'));
}

function autoSave() {
  saveDeck(state.deckName || 'My Deck');
}

function exportText() {
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

async function importText(text) {
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

// ==================== SEARCH ====================
async function doSearch() {
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

async function doPage(delta) {
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

function updatePagination() {
  const pg = document.getElementById('pagination');
  if (!state.search.results.length) { pg.classList.add('hidden'); return; }
  pg.classList.remove('hidden');
  document.getElementById('page-info').textContent = `Page ${state.search.page}`;
  document.getElementById('prev-page').disabled = state.search.page <= 1;
  document.getElementById('next-page').disabled = !state.search.hasMore;
}

// ==================== SUGGESTIONS ====================
async function doSuggestions() {
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

// ==================== EVENTS ====================
function setupEvents() {
  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  document.getElementById('prev-page').addEventListener('click', () => doPage(-1));
  document.getElementById('next-page').addEventListener('click', () => doPage(1));
  document.getElementById('suggest-btn').addEventListener('click', doSuggestions);

  document.getElementById('deck-sort').addEventListener('change', e => {
    state.deckSort = e.target.value;
    renderDeck();
  });

  document.getElementById('format-select').addEventListener('change', e => {
    state.format = e.target.value;
    updateDeckUI();
  });

  document.getElementById('deck-name-input').addEventListener('input', e => {
    state.deckName = e.target.value || 'My Deck';
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    const name = document.getElementById('deck-name-input').value || 'My Deck';
    state.deckName = name;
    saveDeck(name);
    showToast(`Deck "${name}" saved!`, 'success');
  });

  document.getElementById('load-btn').addEventListener('click', () => {
    const names = savedDeckNames();
    if (!names.length) { showToast('No saved decks found', 'warn'); return; }

    const wrap = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = 'Load Deck';
    wrap.appendChild(title);

    names.forEach(name => {
      const row = document.createElement('div');
      row.className = 'load-row';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-gold load-deck-btn';
      loadBtn.textContent = name;
      loadBtn.addEventListener('click', () => { loadDeckByName(name); hideModal(); });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-sm';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        deleteSavedDeck(name);
        row.remove();
        showToast(`Deleted "${name}"`, 'info');
      });

      row.append(loadBtn, delBtn);
      wrap.appendChild(row);
    });

    showModal(wrap);
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const text = exportText();
    const wrap = document.createElement('div');
    wrap.innerHTML = '<h3>Export Deck</h3>';
    const ta = document.createElement('textarea');
    ta.className = 'export-textarea';
    ta.value = text;
    ta.readOnly = true;
    const copy = document.createElement('button');
    copy.className = 'btn btn-gold';
    copy.textContent = 'Copy to Clipboard';
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success'));
    });
    wrap.append(ta, copy);
    showModal(wrap);
  });

  document.getElementById('import-btn').addEventListener('click', showImportModal);
  document.getElementById('share-btn').addEventListener('click', showShareModal);

  document.getElementById('clear-btn').addEventListener('click', () => {
    if (!confirm('Clear the entire deck?')) return;
    state.deck = {};
    state.commander = null;
    updateDeckUI();
    showToast('Deck cleared', 'info');
  });

  document.getElementById('budget-btn').addEventListener('click', () => {
    const wrap = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = 'Make it Cheaper';

    const desc = document.createElement('p');
    desc.textContent = 'Replace cards above this price with synergy-ranked budget alternatives.';

    const label = document.createElement('label');
    label.textContent = 'Max price per card ($)';
    label.style.cssText = 'display:block;font-size:0.82rem;color:var(--text-secondary);margin-bottom:6px;margin-top:14px;';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.25';
    input.step = '0.25';
    input.value = '5';
    input.style.cssText = 'width:100%;margin-bottom:14px;';

    const preview = document.createElement('p');
    preview.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);margin-bottom:12px;min-height:1.2em;';

    const updatePreview = () => {
      const t = parseFloat(input.value) || 0;
      const count = Object.values(state.deck)
        .filter(({ card }) => !isBasicLand(card) && (parseFloat(card.prices?.usd) || 0) > t).length;
      preview.textContent = count ? `${count} card(s) would be replaced.` : 'No cards above that price.';
    };
    input.addEventListener('input', updatePreview);
    updatePreview();

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-budget';
    applyBtn.style.width = '100%';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => {
      const threshold = parseFloat(input.value);
      if (!threshold || threshold <= 0) { showToast('Enter a valid price', 'warn'); return; }
      state.budgetThreshold = threshold;
      hideModal();
      makeCheaper(threshold);
    });

    wrap.append(title, desc, label, input, preview, applyBtn);
    showModal(wrap);
  });

  document.getElementById('tune-btn').addEventListener('click', showTuneDeckModal);
  document.getElementById('collection-btn').addEventListener('click', showCollectionModal);
  document.getElementById('playtest-btn').addEventListener('click', showPlaytestModal);
  document.getElementById('buy-list-btn').addEventListener('click', showBuyListModal);

  let notesSaveTimer;
  document.getElementById('deck-notes').addEventListener('input', e => {
    state.deckNotes = e.target.value;
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => saveDeck(state.deckName || 'My Deck'), 800);
  });

  document.getElementById('modal-close').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) hideModal();
  });
}

// ==================== SHAREABLE LINKS ====================
function generateShareURL() {
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

async function loadFromShareURL() {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return false;
  try {
    const json = decodeURIComponent(escape(atob(hash.slice(7))));
    const data = JSON.parse(json);

    showToast('Loading shared deck…', 'info');

    // Batch-fetch cards from Scryfall /cards/collection (max 75 per request)
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

    history.replaceState(null, '', window.location.pathname); // clear hash
    updateDeckUI();
    showToast(`Loaded "${state.deckName}" (${Object.keys(state.deck).length} cards)`, 'success');
    return true;
  } catch (e) {
    console.error('Share URL parse failed', e);
    showToast('Could not load shared deck', 'error');
    return false;
  }
}

function showShareModal() {
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

// ==================== IMPORT FROM URL ====================
async function importFromURL(rawUrl) {
  const url = rawUrl.trim();

  // Archidekt: https://archidekt.com/decks/12345/...
  const archiMatch = url.match(/archidekt\.com\/decks\/(\d+)/);
  if (archiMatch) {
    return importArchidekt(archiMatch[1]);
  }

  // Moxfield: https://www.moxfield.com/decks/SLUG
  const moxMatch = url.match(/moxfield\.com\/decks\/([\w-]+)/);
  if (moxMatch) {
    return importMoxfield(moxMatch[1]);
  }

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
    // Moxfield public API
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

function showImportModal() {
  const wrap = document.createElement('div');
  const title = h('h3', 'Import Deck');

  // URL section
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

  // Divider
  const div = document.createElement('p');
  div.style.cssText = 'text-align:center;font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px;';
  div.textContent = '— or paste a deck list —';

  // Text section
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

  // Moxfield note
  const moxNote = document.createElement('p');
  moxNote.style.cssText = 'font-size:0.72rem;color:var(--text-secondary);margin-top:10px;';
  moxNote.textContent = 'Tip: For Moxfield, try the URL above. If it fails (CORS), use Export → MTGO in Moxfield and paste the text.';

  wrap.append(title, urlLabel, urlRow, div, hint, ta, textBtn, moxNote);
  showModal(wrap);
}

// ==================== MOBILE TABS ====================
function initMobileTabs() {
  const tabs = document.querySelectorAll('.mobile-tab');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.panel;
      panels.forEach(p => {
        p.classList.toggle('panel-active', p.dataset.panel === target);
      });
    });
  });
  // Activate first tab by default
  if (tabs.length) tabs[0].click();
}

// ==================== INIT ====================
function init() {
  setupEvents();
  loadCollection();
  initMobileTabs();

  // Check for shared deck in URL hash first
  if (window.location.hash.startsWith('#share=')) {
    loadFromShareURL();
    return;
  }

  const names = savedDeckNames();
  if (names.length) {
    loadDeckByName(names[names.length - 1]);
  } else {
    renderDeck();
  }
}

init();
