import { StreamingProviderAdapter } from './adapter-interface.js';
import { NetflixAdapter } from './netflix.js';
import { PrimeVideoAdapter } from './prime-video.js';
import { HotstarAdapter } from './hotstar.js';
import { FallbackAdapter } from './fallback.js';

export class StreamingAdapterRegistry {
  private adapters: StreamingProviderAdapter[] = [];
  private fallbackAdapter: StreamingProviderAdapter;

  constructor() {
    this.fallbackAdapter = new FallbackAdapter();
    // Register adapters in priority order
    this.adapters = [
      new NetflixAdapter(),
      new PrimeVideoAdapter(),
      new HotstarAdapter(),
    ];
  }

  getAdapterForUrl(url: URL): StreamingProviderAdapter {
    for (const adapter of this.adapters) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return this.fallbackAdapter;
  }

  getAdapterById(providerId: string): StreamingProviderAdapter {
    const found = this.adapters.find((a) => a.providerId === providerId);
    return found || this.fallbackAdapter;
  }

  getAllAdapters(): StreamingProviderAdapter[] {
    return [...this.adapters, this.fallbackAdapter];
  }
}

export const adapterRegistry = new StreamingAdapterRegistry();
