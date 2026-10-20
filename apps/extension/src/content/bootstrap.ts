import { adapterRegistry } from '../adapters/registry.js';
import { sendRuntimeMessage } from '../shared/messaging.js';
import { overlay } from './overlay.js';

let lastDetectedKey = '';

async function runDetection() {
  const url = new URL(window.location.href);
  const adapter = adapterRegistry.getAdapterForUrl(url);

  try {
    const context = await adapter.detectContext(document);
    const key = `${context.providerId}:${context.showTitle}:${context.seasonNumber}:${context.episodeNumber}`;

    if (key !== lastDetectedKey) {
      lastDetectedKey = key;
      await sendRuntimeMessage({
        type: 'PAGE_CONTEXT_DETECTED',
        payload: context,
      });

      if (context.showTitle && context.showTitle !== 'Unrecognized Stream') {
        const epLabel = context.seasonNumber
          ? `S${context.seasonNumber} E${context.episodeNumber || 1}`
          : '';
        overlay.updateLabel(`SceneSync: ${context.showTitle} ${epLabel}`);
      }
    }
  } catch (err) {
    console.warn('[SceneSync ContentScript] Detection failed gracefully:', err);
  }
}

function initContentScript() {
  const url = new URL(window.location.href);
  const adapter = adapterRegistry.getAdapterForUrl(url);

  // Mount unobtrusive badge
  overlay.mount();

  // Initial detection
  runDetection();

  // Observe SPA route transitions & dynamic DOM changes
  adapter.observePageChanges(() => {
    runDetection();
  }, document);

  // Also check periodically for slow single-page player hydration
  setInterval(runDetection, 4000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}
