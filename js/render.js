import { state, TYPE_ORDER, FORMAT_LIMITS } from './state.js';
import {
  getImage, getType, isLegendary, isColorLegal, isBasicLand,
  deckTotal, deckLimit, formatPrice, isOwned, ownedQty, isBannedInFormat,
} from './helpers.js';
import { addCard, removeOne, removeAll, addOne, setCommander } from './deck.js';
import { computeStats, drawManaCurve, renderColorDist, renderTypeDist, computeCost } from './stats.js';
import { showPreview, hidePreview, movePreview, showToast } from './ui.js';

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

// Callbacks registered by main.js to avoid circular imports.
let _autoSave = () => {};
let _showAlternatives = null;

export function registerAutoSave(fn) { _autoSave = fn; }
export function registerShowAlternatives(fn) { _showAlternatives = fn; }

export function updateDeckUI() {
  renderDeck();
  _autoSave();
}

export function renderSearch(cards) {
  const el = document.getElementById('search-results');
  el.innerHTML = '';
  if (!cards.length) { el.innerHTML = '<p class="no-results">No cards found.</p>'; return; }
  cards.forEach(card => el.appendChild(makeCardEl(card)));
}

export function renderSuggestions(cards) {
  const el = document.getElementById('suggestions-list');
  el.innerHTML = '';
  if (!cards.length) { el.innerHTML = '<p class="no-results">No suggestions found.</p>'; return; }
  cards.forEach(card => el.appendChild(makeCardEl(card)));
}

export function makeCardEl(card) {
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
  add.addEventListener('click', e => {
    e.stopPropagation();
    if (addCard(card)) updateDeckUI();
  });

  el.append(img, info);
  if (isLegendary(card)) {
    const crown = document.createElement('button');
    crown.className = 'btn btn-xs crown-btn';
    crown.textContent = '♛';
    crown.title = 'Set as Commander';
    crown.addEventListener('click', e => {
      e.stopPropagation();
      setCommander(card);
      showToast(`${card.name} set as Commander`, 'success');
      updateDeckUI();
    });
    el.appendChild(crown);
  }
  el.appendChild(add);
  el.addEventListener('mouseenter', e => showPreview(card, e));
  el.addEventListener('mouseleave', hidePreview);
  el.addEventListener('mousemove', movePreview);
  return el;
}

export function makeDeckRow(card, qty) {
  const row = document.createElement('div');
  row.className = 'deck-row';

  const qtyCtrl = document.createElement('div');
  qtyCtrl.className = 'qty-controls';

  const minus = document.createElement('button');
  minus.className = 'btn btn-xs';
  minus.textContent = '-';
  minus.addEventListener('click', () => { removeOne(card.id); updateDeckUI(); });

  const qtyNum = document.createElement('span');
  qtyNum.className = 'qty-num';
  qtyNum.textContent = qty;

  const plus = document.createElement('button');
  plus.className = 'btn btn-xs';
  plus.textContent = '+';
  plus.addEventListener('click', () => { if (addOne(card.id)) updateDeckUI(); });

  const del = document.createElement('button');
  del.className = 'btn btn-xs btn-danger';
  del.textContent = 'x';
  del.title = 'Remove all copies';
  del.addEventListener('click', () => { removeAll(card.id); updateDeckUI(); });

  qtyCtrl.append(minus, qtyNum, plus, del);

  const rarityDot = document.createElement('span');
  rarityDot.className = `rarity-dot rarity-${card.rarity || 'common'}`;
  rarityDot.title = card.rarity || 'common';

  const nameEl = document.createElement('span');
  nameEl.className = state.commander ? 'deck-card-name deck-card-link' : 'deck-card-name';
  nameEl.textContent = card.name;
  nameEl.title = state.commander ? 'Click for alternatives' : '';
  if (state.commander) nameEl.addEventListener('click', e => { e.stopPropagation(); _showAlternatives?.(card); });

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

export function renderDeck() {
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

    const buildWrap = document.createElement('div');
    buildWrap.className = 'cmd-action-primary';

    const buildBtn = document.createElement('button');
    buildBtn.id = 'build-deck-btn';
    buildBtn.className = 'btn btn-gold cmd-action-btn';
    buildBtn.textContent = '✦ Auto-Build Full Deck';

    const buildDesc = document.createElement('p');
    buildDesc.className = 'cmd-action-desc';
    buildDesc.textContent = 'Clears the deck and builds 99 cards from scratch using EDHRec synergy for your commander.';

    buildWrap.append(buildBtn, buildDesc);

    const divider = document.createElement('div');
    divider.className = 'cmd-action-divider';
    divider.innerHTML = '<span>or, if deck already has cards</span>';

    const fillWrap = document.createElement('div');
    fillWrap.className = 'cmd-action-secondary';

    const fillBtn = document.createElement('button');
    fillBtn.id = 'fill-deck-btn';
    fillBtn.className = 'btn cmd-action-btn';
    const remaining = deckLimit() - deckTotal();
    const bLabel = state.budgetThreshold ? ` ≤$${state.budgetThreshold}` : '';
    fillBtn.textContent = remaining > 0 ? `Fill Remaining Slots${bLabel} (${remaining})` : 'Deck Full';
    fillBtn.disabled = remaining <= 0;

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
