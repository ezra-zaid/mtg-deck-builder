import { getImage } from './helpers.js';

export function h(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
export function lbl(text) { const el = document.createElement('label'); el.textContent = text; return el; }

let previewTimer;

export function showPreview(card, e) {
  if (window.matchMedia('(hover: none)').matches) return;
  clearTimeout(previewTimer);
  const img = document.getElementById('preview-img');
  const src = getImage(card, 'normal');
  if (!src) return;
  img.src = src;
  const preview = document.getElementById('card-preview');
  preview.classList.add('visible');
  movePreview(e);
}

export function hidePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    document.getElementById('card-preview').classList.remove('visible');
  }, 80);
}

export function movePreview(e) {
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

export function showModal(node) {
  const content = document.getElementById('modal-content');
  content.innerHTML = '';
  if (typeof node === 'string') content.innerHTML = node;
  else content.appendChild(node);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

export function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

export function showToast(msg, type = 'info') {
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
