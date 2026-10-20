import { StreamingProviderAdapter } from './adapter-interface.js';
import {
  DetectedStreamingContext,
  ProviderCapabilities,
  StreamingProviderId,
} from '@scenesync/shared-types';

export class NetflixAdapter implements StreamingProviderAdapter {
  readonly providerId: StreamingProviderId = 'netflix';
  readonly version = '1.2.0';

  matches(url: URL): boolean {
    return url.hostname.includes('netflix.com');
  }

  getCapabilities(): ProviderCapabilities {
    return {
      canDetectShowTitle: true,
      canDetectEpisode: true,
      canDetectTimeOffset: false,
      requiresManualConfirmation: true,
      verificationStatus: 'verified_automated',
      supportedDomains: ['netflix.com'],
    };
  }

  async detectContext(
    doc: any = typeof document !== 'undefined' ? document : {}
  ): Promise<DetectedStreamingContext> {
    const url = new URL(doc.location?.href || 'https://www.netflix.com');
    const now = new Date().toISOString();

    // 1. Try URL pattern for watch ID: /watch/81234567
    const watchMatch = url.pathname.match(/\/watch\/(\d+)/);
    const titleMatch = url.pathname.match(/\/title\/(\d+)/);
    const contentId = watchMatch ? watchMatch[1] : titleMatch ? titleMatch[1] : null;

    // 2. DOM Player Title Card inspection
    const titleElem =
      doc.querySelector('[data-uia="video-title"]') ||
      doc.querySelector('.video-title') ||
      doc.querySelector('.ellipsize-text');

    let showTitle = '';
    let seasonNumber: number | null = null;
    let episodeNumber: number | null = null;
    let episodeTitle: string | null = null;
    let confidence = 0.4;
    let detectionMethod: any = 'url';

    if (titleElem && titleElem.textContent) {
      const fullText = titleElem.textContent.trim();
      detectionMethod = 'dom_player';
      confidence = 0.85;

      // Format often looks like: "Chronicles of Aethelgard S1:E6 The Siege of Ravenfall"
      // or "Show Title" with subtitle "S1:E6 Episode Name"
      const sEpMatch = fullText.match(/[Ss](\d+)[\s:]*[Ee](\d+)/) ||
                       fullText.match(/Season\s*(\d+)[,\s]+Episode\s*(\d+)/i);
      if (sEpMatch) {
        seasonNumber = parseInt(sEpMatch[1]!, 10);
        episodeNumber = parseInt(sEpMatch[2]!, 10);
        showTitle = fullText.substring(0, sEpMatch.index).trim();
        const afterMatch = fullText.substring((sEpMatch.index ?? 0) + sEpMatch[0].length).replace(/^[\s:-]+/, '').trim();
        if (afterMatch) episodeTitle = afterMatch;
      } else {
        showTitle = fullText;
      }
    }

    // Fallback to document title if player DOM is not active
    if (!showTitle && doc.title) {
      const cleanTitle = doc.title.replace(/\s*-\s*Netflix$/i, '').trim();
      if (cleanTitle && cleanTitle !== 'Netflix') {
        showTitle = cleanTitle;
        detectionMethod = 'dom_metadata';
        confidence = 0.6;
      }
    }

    // If still blank, use fallback title
    if (!showTitle) {
      showTitle = 'Unknown Netflix Title';
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
      attributeFilter: ['class', 'data-uia'],
    });

    return () => observer.disconnect();
  }
}
