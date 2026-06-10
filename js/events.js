import { state } from './state.js';
import { showModal, hideModal, showToast, h } from './ui.js';
import { renderDeck, updateDeckUI } from './render.js';
import { saveDeck, loadDeckByName, deleteSavedDeck, savedDeckNames, exportText, importText } from './storage.js';
import { showCollectionModal } from './collection.js';
import { showBuildDeckModal, makeCheaper, fillDeck } from './commander.js';
import { showTuneDeckModal } from './tune.js';
import { showPlaytestModal } from './playtest.js';
import { showShareModal, showImportModal } from './share.js';
import { showBuyListModal } from './buylist.js';
import { doSearch, doPage, doSuggestions } from './search.js';
import { isBasicLand } from './helpers.js';

export function setupEvents() {
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

  // Dynamic buttons rendered inside deck-list panel (build/fill).
  document.getElementById('deck-list').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'build-deck-btn') showBuildDeckModal();
    if (btn.id === 'fill-deck-btn') fillDeck();
  });

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

export function initMobileTabs() {
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
  if (tabs.length) tabs[0].click();
}
