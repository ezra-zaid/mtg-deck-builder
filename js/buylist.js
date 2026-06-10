import { state } from './state.js';
import { isBasicLand, isOwned, ownedQty, formatPrice } from './helpers.js';
import { h, showModal, showToast, showPreview, hidePreview, movePreview } from './ui.js';

export function showBuyListModal() {
  const hasCollection = Object.keys(state.collection).length > 0;

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
