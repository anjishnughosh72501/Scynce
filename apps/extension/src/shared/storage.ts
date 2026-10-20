import { DetectedStreamingContext } from '@scenesync/shared-types';
import { nanoid } from 'nanoid';

export interface ExtensionStoredState {
  installationId: string;
  sessionId: string | null;
  apiBaseUrl: string;
  detectedContext: DetectedStreamingContext | null;
  confirmedContext: DetectedStreamingContext | null;
  isOverlayEnabled: boolean;
}

const DEFAULT_STATE: ExtensionStoredState = {
  installationId: `inst_${nanoid(16)}`,
  sessionId: null,
  apiBaseUrl: 'http://localhost:4000',
  detectedContext: null,
  confirmedContext: null,
  isOverlayEnabled: true,
};

export async function getStoredState(): Promise<ExtensionStoredState> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['scenesync_state'], (result) => {
        if (result.scenesync_state) {
          resolve({ ...DEFAULT_STATE, ...result.scenesync_state });
        } else {
          // Initialize and save
          chrome.storage.local.set({ scenesync_state: DEFAULT_STATE });
          resolve(DEFAULT_STATE);
        }
      });
    });
  }

  // Fallback for tests or node environments
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('scenesync_state') : null;
  if (raw) {
    try {
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_STATE;
    }
  }
  return DEFAULT_STATE;
}

export async function updateStoredState(
  partial: Partial<ExtensionStoredState>
): Promise<ExtensionStoredState> {
  const current = await getStoredState();
  const updated = { ...current, ...partial };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ scenesync_state: updated }, () => {
        resolve(updated);
      });
    });
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('scenesync_state', JSON.stringify(updated));
  }
  return updated;
}
