import { StreamingProviderAdapter } from './adapter-interface.js';
import {
  DetectedStreamingContext,
  ProviderCapabilities,
  StreamingProviderId,
} from '@scenesync/shared-types';

export class FallbackAdapter implements StreamingProviderAdapter {
  readonly providerId: StreamingProviderId = 'fallback';
  readonly version = '1.0.0';

  matches(_url: URL): boolean {
    return true; // Catch-all fallback
  }

  getCapabilities(): ProviderCapabilities {
    return {
      canDetectShowTitle: false,
      canDetectEpisode: false,
      canDetectTimeOffset: false,
      requiresManualConfirmation: true,
      verificationStatus: 'verified_manual_fallback',
      supportedDomains: ['*'],
    };
  }

  async detectContext(
    doc: any = typeof document !== 'undefined' ? document : {}
  ): Promise<DetectedStreamingContext> {
    const now = new Date().toISOString();

    // Check OpenGraph title or document.title
    let showTitle = '';
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle) {
      showTitle = ogTitle.trim();
    } else if (doc.title) {
      showTitle = doc.title.trim();
    }

    return {
      providerId: this.providerId,
      showTitle: showTitle || 'Unrecognized Stream',
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      canonicalContentId: null,
      detectionMethod: showTitle ? 'dom_metadata' : 'unverified',
      confidence: 0.1,
      lastDetectedAt: now,
    };
  }

  observePageChanges(_callback: () => void): () => void {
    return () => {};
  }
}
