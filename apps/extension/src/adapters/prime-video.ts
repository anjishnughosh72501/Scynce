import { StreamingProviderAdapter } from './adapter-interface.js';
import {
  DetectedStreamingContext,
  ProviderCapabilities,
  StreamingProviderId,
} from '@scenesync/shared-types';

export class PrimeVideoAdapter implements StreamingProviderAdapter {
  readonly providerId: StreamingProviderId = 'prime-video';
  readonly version = '1.1.0';

  matches(url: URL): boolean {
    return (
      url.hostname.includes('primevideo.com') ||
      (url.hostname.includes('amazon.') &&
        (url.pathname.includes('/video/') || url.pathname.includes('/gp/video/')))
    );
  }

  getCapabilities(): ProviderCapabilities {
    return {
      canDetectShowTitle: true,
      canDetectEpisode: true,
      canDetectTimeOffset: false,
      requiresManualConfirmation: true,
      verificationStatus: 'verified_automated',
      supportedDomains: ['primevideo.com', 'amazon.com'],
    };
  }

  async detectContext(
    doc: any = typeof document !== 'undefined' ? document : {}
  ): Promise<DetectedStreamingContext> {
    const url = new URL(doc.location?.href || 'https://www.primevideo.com');
    const now = new Date().toISOString();

    // 1. URL pattern extraction: /detail/amzn1.dv.gti... or /detail/B08...
    const detailMatch = url.pathname.match(/\/detail\/([^/]+)/);
    const contentId = detailMatch ? detailMatch[1] : null;

    // 2. DOM inspection
    const titleElem =
      doc.querySelector('[data-automation-id="title"]') ||
      doc.querySelector('.atvwebplayersdk-title-text') ||
      doc.querySelector('h1[data-automation-id="title"]') ||
      doc.querySelector('.dv-node-dp-title');

    const subtitleElem =
      doc.querySelector('[data-automation-id="subtitle"]') ||
      doc.querySelector('.atvwebplayersdk-subtitle-text');

    let showTitle = '';
    let seasonNumber: number | null = null;
    let episodeNumber: number | null = null;
    let episodeTitle: string | null = null;
    let confidence = 0.4;
    let detectionMethod: any = 'url';

    if (titleElem && titleElem.textContent) {
      showTitle = titleElem.textContent.trim();
      detectionMethod = 'dom_player';
      confidence = 0.85;

      if (subtitleElem && subtitleElem.textContent) {
        const sub = subtitleElem.textContent.trim();
        const sMatch = sub.match(/S(?:eason)?\.?\s*(\d+)/i);
        const eMatch = sub.match(/Ep(?:isode)?\.?\s*(\d+)/i) || sub.match(/[Ee](\d+)/);
        if (sMatch) seasonNumber = parseInt(sMatch[1]!, 10);
        if (eMatch) episodeNumber = parseInt(eMatch[1]!, 10);
        episodeTitle = sub;
      }
    }

    if (!showTitle && doc.title) {
      const cleanTitle = doc.title
        .replace(/Watch\s+/i, '')
        .replace(/\s*\|\s*Prime Video$/i, '')
        .trim();
      if (cleanTitle) {
        showTitle = cleanTitle;
        detectionMethod = 'dom_metadata';
        confidence = 0.6;
      }
    }

    if (!showTitle) {
      showTitle = 'Unknown Prime Video Title';
      confidence = 0.2;
      detectionMethod = 'unverified';
    }

    return {
      providerId: this.providerId,
      showTitle,
      seasonNumber,
      episodeNumber,
      episodeTitle,
      canonicalContentId: contentId,
      detectionMethod,
      confidence,
      lastDetectedAt: now,
    };
  }

  observePageChanges(
    callback: () => void,
    doc: any = typeof document !== 'undefined' ? document : {}
  ): () => void {
    if (!doc.body) return () => {};

    const observer = new MutationObserver(() => {
      callback();
    });

    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => observer.disconnect();
  }
}
