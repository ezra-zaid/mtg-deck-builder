import { state } from './state.js';
import { isColorLegal, isBasicLand, getType, deckTotal, deckLimit } from './helpers.js';
import { apiGet, SCRYFALL } from './api.js';
import { h, lbl, showModal, hideModal, showToast } from './ui.js';
import { updateDeckUI } from './render.js';

export const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land'];

export const STRATEGIES = {
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
  'Mill':            '(o:mill OR o:"put the top" o:"into their graveyard" OR o:"opponent mills")',
  'Life Gain':       '(o:"gain" o:"life" OR keyword:lifelink OR o:"you gain" o:"life")',
  'Burn':            '(o:"deals" o:"damage to any target" OR o:"damage to each opponent" OR o:"damage to each player")',
  'Control':         '(o:"counter target" OR o:"return" o:"to its owner" o:"hand" OR o:"tap all")',
  'Voltron':         '(o:equip OR o:"enchant creature" OR o:"attach" o:"to target creature")',
  'Proliferate':     '(o:proliferate OR keyword:proliferate)',
  'Storm / Spells':  '(keyword:storm OR o:"copy of the spell" OR o:"copies of it" OR o:"whenever you cast an instant or sorcery")',
  'Extra Turns':     '(o:"extra turn" OR o:"additional turn")',
  'Landfall':        '(o:landfall OR o:"whenever a land enters the battlefield" OR o:"whenever you play a land")',
  'Blink / Flicker': '(o:"exile" o:"then return" OR o:"flicker" OR o:"phase out")',
};

export function descriptionToQueryParts(text) {
  if (!text) return [];
  const t = text.toLowerCase().trim();
  const parts = [];
  const add = name => { if (STRATEGIES[name] && !parts.includes(STRATEGIES[name])) parts.push(STRATEGIES[name]); };

  if (/\baggro\b|attack|combat|haste|offensive|beatdown/.test(t))          add('Aggressive');
  if (/token|swarm|wide|army|flood|populate/.test(t))                      add('Tokens / Swarm');
  if (/\bdraw\b|card advantage|cantrip|refill|hand size/.test(t))          add('Card Draw');
  if (/remov|destroy|exile|\bkill\b|wipe|board clear|sweep/.test(t))       add('Removal');
  if (/\bramp\b|mana acceler|land ramp|land search|resource/.test(t))      add('Ramp / Mana');
  if (/grave|reanimat|recursion|flashback|return from|dredge/.test(t))     add('Graveyard');
  if (/\+1\/\+1|\bcounter\b|proliferate|\bgrow\b|\bpump\b|buff/.test(t))  add('+1/+1 Counters');
  if (/sacrifi|\bsac\b|aristocrat|\bdie\b|\bdies\b|drain|blood/.test(t))   add('Sacrifice');
  if (/tribal|creature type|goblin|elf|human|vampire|zombie|dragon/.test(t)) add('Tribal Synergy');
  if (/protect|hexproof|indestructible|shroud|shield/.test(t))             add('Protection');
  if (/\bmill\b|milling|mill card|deck out|library into/.test(t))          add('Mill');
  if (/life gain|lifegain|gain life|lifelink|drain life|\blife\b/.test(t)) add('Life Gain');
  if (/\bburn\b|direct damage|shock|lightning|fireball|damage to/.test(t)) add('Burn');
  if (/\bcontrol\b|counterspell|counter spell|permission|bounce/.test(t))  add('Control');
  if (/voltron|equip|aura|enchant creature|\bweapon\b|attach/.test(t))     add('Voltron');
  if (/\bproliferate\b/.test(t))                                            add('Proliferate');
  if (/\bstorm\b|spellslinger|spell copy|instant.*sorcery|cantrip/.test(t)) add('Storm / Spells');
  if (/extra turn|additional turn|time walk|take another turn/.test(t))    add('Extra Turns');
  if (/landfall|whenever.*land|play.*land|land drop/.test(t))              add('Landfall');
  if (/blink|flicker|phase out|exile.*return/.test(t))                     add('Blink / Flicker');

  if (!parts.length) {
    const words = t.split(/\W+/).filter(w => w.length > 2);
    if (words.length) {
      parts.push(`(${words.map(w => `o:${w}`).join(' OR ')})`);
    }
  }

  return parts;
}

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

export function showTuneDeckModal() {
  if (!state.commander) { showToast('Set a Commander first!', 'warn'); return; }

  const wrap = document.createElement('div');

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

  const s1 = h('h3', 'Strategy Focus');
  const s2 = h('p', 'Click a strategy chip or type any theme — even custom keywords like "cascade" or "landfall" will work.');

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
  descIn.placeholder = 'e.g. Mill, Burn, Voltron, Cascade, Landfall, Blink...';
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

export async function rebalanceTypes(addType, removeType, count) {
  try {
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

export async function applyStrategy(queryParts, swapCount) {
  try {
    showToast('Finding strategy-focused cards...', 'info');

    const strategyFilter = `(${queryParts.join(' OR ')})`;
    let q = `commander:"${state.commander.name}" -t:land ${strategyFilter}`;
    if (state.budgetThreshold) q += ` usd<${state.budgetThreshold}`;

    let data = await apiGet(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);

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
