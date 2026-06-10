import { state, TYPE_ORDER, COLOR_NAMES, COLOR_HEX } from './state.js';
import { getType, deckTotal } from './helpers.js';

export function computeStats() {
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

export function drawManaCurve(stats) {
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

export function renderColorDist(colors) {
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

export function renderTypeDist(types) {
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

export function computeCost() {
  let total = 0;
  for (const { card, qty } of Object.values(state.deck)) {
    total += (parseFloat(card.prices?.usd) || 0) * qty;
  }
  if (state.commander) total += parseFloat(state.commander.prices?.usd) || 0;
  return total;
}
