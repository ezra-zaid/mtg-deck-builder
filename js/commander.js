import { state } from './state.js';
import { isColorLegal, isBasicLand, deckTotal, deckLimit, getImage, getType, isOwned, ownedQty, formatPrice } from './helpers.js';
import { apiGet, SCRYFALL, delay } from './api.js';
import { h, lbl, showModal, hideModal, showToast, showPreview, hidePreview, movePreview } from './ui.js';
import { updateDeckUI } from './render.js';

export function showBuildDeckModal() {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
  const title = h('h3', `Build Deck for ${state.commander.name}`);

  const totalRow = document.createElement('div');
  totalRow.className = 'land-input-row';
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total lands in deck:';
  const totalIn = document.createElement('input');
  totalIn.type = 'number'; totalIn.min = '0'; totalIn.max = '60'; totalIn.value = '37';
  totalRow.append(totalLabel, totalIn);

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

export async function buildDeck({ landCount = 37, basicCount = 37, fillSpecial = false } = {}) {
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

    if (landCount > 0) {
      if (fillSpecial) {
        const specialCount = landCount - basicCount;
        showToast(`Fetching ${specialCount} non-basic land(s)...`, 'info');
        const landQ = `commander:"${state.commander.name}" t:land -t:basic`;
        const landData = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(landQ)}&order=edhrec&unique=cards`);
        const nonbasics = (landData?.data || []).filter(c => isColorLegal(c));
        let added = 0;
        for (const card of nonbasics) {
          if (added >= specialCount) break;
          if (!state.deck[card.id]) { state.deck[card.id] = { card, qty: 1 }; added++; }
        }
        if (basicCount > 0) {
          showToast(`Adding ${basicCount} basic land(s)...`, 'info');
          await addBasicLands(ci, basicCount);
        }
      } else {
        showToast(`Adding ${basicCount} basic land(s)...`, 'info');
        await addBasicLands(ci, basicCount);
      }
    }

    updateDeckUI();
    showToast(`Deck built! ${Object.values(state.deck).reduce((s, { qty }) => s + qty, 0)} cards + ${state.commander.name}`, 'success');
  } catch (e) {
    showToast('Failed to build deck', 'error');
    console.error(e);
  } finally {
    const b = document.getElementById('build-deck-btn');
    if (b) { b.textContent = '✦ Auto-Build Full Deck'; b.disabled = false; }
  }
}

export async function makeCheaper(threshold) {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const btn = document.getElementById('budget-btn');
  if (btn) { btn.textContent = 'Working...'; btn.disabled = true; }

  try {
    const expensive = Object.values(state.deck)
      .filter(({ card }) => !isBasicLand(card) && (parseFloat(card.prices?.usd) || 0) > threshold)
      .sort((a, b) => (parseFloat(b.card.prices?.usd) || 0) - (parseFloat(a.card.prices?.usd) || 0));

    if (!expensive.length) {
      showToast(`No cards above $${threshold.toFixed(2)} in your deck!`, 'info');
      return;
    }

    showToast(`Finding budget replacements for ${expensive.length} card(s)...`, 'info');

    const removedIds = new Set(expensive.map(({ card }) => card.id));
    expensive.forEach(({ card }) => delete state.deck[card.id]);

    const q = `commander:"${state.commander.name}" usd<${threshold} -t:land`;
    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);

    if (!data || !data.data) {
      expensive.forEach(({ card, qty }) => { state.deck[card.id] = { card, qty }; });
      showToast('Could not fetch budget alternatives', 'error');
      return;
    }

    const deckIds = new Set(Object.keys(state.deck));
    const alternatives = data.data.filter(c =>
      !deckIds.has(c.id) && !removedIds.has(c.id) && isColorLegal(c) && c.id !== state.commander.id
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

export async function fillDeck() {
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

export async function showAlternatives(card) {
  const type = getType(card);
  const cmc  = card.cmc || 0;

  let baseQ = `commander:"${state.commander.name}"`;
  if (type !== 'Land' && type !== 'Other') baseQ += ` t:${type.toLowerCase()}`;

  const wrap = document.createElement('div');
  const titleEl = document.createElement('h3');
  titleEl.textContent = `Alternatives for ${card.name}`;
  const loading = document.createElement('p');
  loading.textContent = 'Loading...';
  wrap.append(titleEl, loading);
  showModal(wrap);

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
      if (countEl) countEl.textContent = `Showing ${totalShown} alternatives`;
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

  try {
    const firstUrl = `${SCRYFALL}/cards/search?q=${encodeURIComponent(baseQ)}&order=edhrec&unique=cards`;
    const data = await apiGet(firstUrl);
    nextUrl = data?.has_more ? data.next_page : null;

    const fresh = (data?.data || []).filter(c => !shownIds.has(c.id) && isColorLegal(c));
    const firstPage = fresh.slice(0, PAGE_SIZE);

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

export async function addBasicLands(colorIdentity, count) {
  const landMap = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
  const colors = colorIdentity.filter(c => landMap[c]);

  if (!colors.length) {
    const data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent('!"Wastes" t:basic')}&unique=cards`);
    const wastes = data?.data?.[0];
    if (wastes) state.deck[wastes.id] = { card: wastes, qty: count };
    return;
  }

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

