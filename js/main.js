import { registerAutoSave, registerShowAlternatives, renderDeck } from './render.js';
import { autoSave, savedDeckNames, loadDeckByName } from './storage.js';
import { loadCollection } from './collection.js';
import { showAlternatives } from './commander.js';
import { loadFromShareURL } from './share.js';
import { setupEvents, initMobileTabs } from './events.js';

function init() {
  // Wire up callbacks that break potential circular imports.
  registerAutoSave(autoSave);
  registerShowAlternatives(showAlternatives);

  setupEvents();
  loadCollection();
  initMobileTabs();

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
