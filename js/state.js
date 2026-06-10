export const state = {
  deck: {},
  commander: null,
  search: { results: [], page: 1, hasMore: false, query: '', colors: '', type: '', sort: 'name' },
  format: 'commander',
  deckName: 'My Deck',
  deckSort: 'type',
  budgetThreshold: null,
  collection: {},
  deckNotes: '',
};

export const FORMAT_LIMITS = { commander: 100, standard: 60, modern: 60, legacy: 60, pauper: 60 };
export const TYPE_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Other'];
export const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless' };
export const COLOR_HEX   = { W: '#f5f0e0', U: '#3b82f6', B: '#a855f7', R: '#ef4444', G: '#22c55e', C: '#9ca3af' };
