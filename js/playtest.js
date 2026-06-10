import { state } from './state.js';
import { getImage } from './helpers.js';
import { showPreview, hidePreview, movePreview, showToast } from './ui.js';

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function showPlaytestModal() {
  if (!Object.keys(state.deck).length) { showToast('Add cards to the deck first', 'warn'); return; }

  const allCards = [];
  Object.values(state.deck).forEach(({ card, qty }) => {
    for (let i = 0; i < qty; i++) allCards.push(card);
  });

  let library = [], hand = [], battlefield = [], graveyard = [], exile = [];
  let turn = 0, mulliganSize = 7;
  let selectedHandIdx = -1;
  let tokens = 0;
  let cmdOnBattlefield = false;
  let cmdTax = 0;

  function newGame() {
    library = shuffle(allCards);
    hand = []; battlefield = []; graveyard = []; exile = [];
    turn = 1; mulliganSize = 7; selectedHandIdx = -1; tokens = 0;
    cmdOnBattlefield = false; cmdTax = 0;
    hand.push(...library.splice(0, 7));
    render();
  }

  function castCommander() { cmdOnBattlefield = true; cmdTax++; render(); }
  function returnCmdToZone() { cmdOnBattlefield = false; render(); }

  function endTurn() {
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

  function playCard(idx) { battlefield.push({ card: hand.splice(idx, 1)[0], tapped: false }); selectedHandIdx = -1; render(); }
  function discardCard(idx) { graveyard.push(hand.splice(idx, 1)[0]); selectedHandIdx = -1; render(); }
  function exileCard(idx) { exile.push(hand.splice(idx, 1)[0]); selectedHandIdx = -1; render(); }

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('hidden');
  overlay.classList.add('playtest-fullscreen');
  const modalEl = overlay.querySelector('.modal');
  modalEl.classList.add('modal-playtest');
  const contentEl = document.getElementById('modal-content');
  contentEl.innerHTML = '';

  const origClose = () => {
    overlay.classList.remove('playtest-fullscreen');
    modalEl.classList.remove('modal-playtest');
  };
  document.getElementById('modal-close').addEventListener('click', origClose, { once: true });
  overlay.addEventListener('click', e => { if (e.target === overlay) origClose(); }, { once: true });

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

  const cmdStrip = document.createElement('div');
  cmdStrip.className = 'playtest-cmd';

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

    cmdStrip.innerHTML = '';
    if (state.commander) {
      const cmdLabel = document.createElement('span');
      cmdLabel.className = 'playtest-zone-label';
      cmdLabel.textContent = 'Command Zone';

      if (cmdOnBattlefield) {
        const awayNote = document.createElement('span');
        awayNote.className = 'cmd-away-note';
        awayNote.textContent = `${state.commander.name} is on the battlefield`;
        cmdStrip.append(cmdLabel, awayNote);
      } else {
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

    const bfDisplay = [...battlefield];
    if (cmdOnBattlefield) bfDisplay.unshift({ card: state.commander, tapped: false, isCommander: true });

    const isTouch = window.matchMedia('(hover: none)').matches;
    const bfHint = isTouch ? 'tap to tap/untap  ·  × to remove' : 'click to tap/untap  ·  double-click or × to remove';
    bfZone._label.textContent = `Battlefield — ${bfDisplay.length} permanent(s)  ·  ${bfHint}`;
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
          returnCmdToZone();
        } else {
          graveyard.push(battlefield.splice(idx - (cmdOnBattlefield ? 1 : 0), 1)[0].card);
          render();
        }
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'bf-remove-btn';
      removeBtn.textContent = '×';
      removeBtn.title = isCmd ? 'Return to Command Zone' : 'Send to Graveyard';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (isCmd) {
          returnCmdToZone();
        } else {
          graveyard.push(battlefield.splice(idx - (cmdOnBattlefield ? 1 : 0), 1)[0].card);
          render();
        }
      });
      el.appendChild(removeBtn);

      if (isCmd) {
        const cmdTag = document.createElement('span');
        cmdTag.className = 'cmd-battlefield-tag';
        cmdTag.textContent = 'Commander';
        el.appendChild(cmdTag);
      }

      bfZone._cards.appendChild(el);
    });

    handZone._label.textContent = `Hand — ${hand.length} card(s)  ·  click to select, then choose action`;
    handZone._cards.innerHTML = '';
    hand.forEach((card, idx) => {
      const isSelected = idx === selectedHandIdx;
      const el = makeThumb(card, () => {
        selectedHandIdx = isSelected ? -1 : idx;
        render();
      }, isSelected ? 'selected' : '');

      if (isSelected) {
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

    gyZone._label.textContent = `Graveyard (${graveyard.length})  ·  click to return to hand`;
    gyZone._cards.innerHTML = '';
    graveyard.slice().reverse().forEach((card, ri) => {
      const idx = graveyard.length - 1 - ri;
      gyZone._cards.appendChild(makeThumb(card, () => {
        hand.push(graveyard.splice(idx, 1)[0]);
        render();
      }));
    });

    exZone._label.textContent = `Exile (${exile.length})`;
    exZone._cards.innerHTML = '';
    exile.forEach(card => exZone._cards.appendChild(makeThumb(card, null)));
  }

  newGame();
}
