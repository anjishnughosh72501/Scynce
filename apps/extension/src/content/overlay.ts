export class SceneSyncOverlay {
  private element: HTMLElement | null = null;
  private isVisible: boolean = false;

  mount() {
    if (this.element || document.getElementById('scenesync-floating-badge')) return;

    this.element = document.createElement('div');
    this.element.id = 'scenesync-floating-badge';
    this.element.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(139, 92, 246, 0.4);
      border-radius: 9999px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
    `;

    this.element.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
      <span>SceneSync Active</span>
      <span style="opacity: 0.6; font-size: 10px;">• Side Panel</span>
    `;

    this.element.addEventListener('click', () => {
      // User tapped overlay badge - open sidepanel if permitted
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' }).catch(() => {});
      }
    });

    document.body.appendChild(this.element);
    this.isVisible = true;
  }

  updateLabel(label: string) {
    if (!this.element) return;
    this.element.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
      <span>${label}</span>
    `;
  }

  unmount() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
      this.isVisible = false;
    }
  }
}

export const overlay = new SceneSyncOverlay();
