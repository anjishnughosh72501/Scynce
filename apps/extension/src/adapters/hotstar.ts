import { StreamingProviderAdapter } from './adapter-interface.js';
import {
  DetectedStreamingContext,
  ProviderCapabilities,
  StreamingProviderId,
} from '@scenesync/shared-types';

export class HotstarAdapter implements StreamingProviderAdapter {
  readonly providerId: StreamingProviderId = 'hotstar';
  readonly version = '1.0.0';

  matches(url: URL): boolean {
    return (
      url.hostname.includes('hotstar.com') ||
      url.hostname.includes('jiostar.com')
    );
  }

  getCapabilities(): ProviderCapabilities {
    return {
      canDetectShowTitle: true,
      canDetectEpisode: true,
      canDetectTimeOffset: false,
      requiresManualConfirmation: true,
      verificationStatus: 'verified_automated',
      supportedDomains: ['hotstar.com', 'jiostar.com'],
    };
  }

  async detectContext(
    doc: any = typeof document !== 'undefined' ? document : {}
  ): Promise<DetectedStreamingContext> {
    const url = new URL(doc.location?.href || 'https://www.hotstar.com');
    const now = new Date().toISOString();

    // 1. URL pattern: /shows/show-name/12345/episode-name/67890
    const parts = url.pathname.split('/').filter(Boolean);
    const contentId = parts.length > 0 ? parts[parts.length - 1] : null;

    // 2. DOM inspection
    const titleElem =
      doc.querySelector('.show-title') ||
      doc.querySelector('[data-testid="player-title"]') ||
      doc.querySelector('.watch-title') ||
      doc.querySelector('h1');

    const epElem =
      doc.querySelector('.episode-title') ||
      doc.querySelector('[data-testid="episode-title"]');

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

      if (epElem && epElem.textContent) {
        const text = epElem.textContent.trim();
        const sMatch = text.match(/[Ss](\d+)/) || text.match(/Season\s*(\d+)/i);
        const eMatch = text.match(/[Ee](\d+)/) || text.match(/Episode\s*(\d+)/i);
        if (sMatch) seasonNumber = parseInt(sMatch[1]!, 10);
        if (eMatch) episodeNumber = parseInt(eMatch[1]!, 10);
        episodeTitle = text;
      }
    }

    if (!showTitle && doc.title) {
      const cleanTitle = doc.title.replace(/\s*-\s*JioHotstar$/i, '').replace(/\s*-\s*Disney\+ Hotstar$/i, '').trim();
      if (cleanTitle) {
        showTitle = cleanTitle;
        detectionMethod = 'dom_metadata';
        confidence = 0.55;
      }
    }

    if (!showTitle) {
      showTitle = 'Unknown Hotstar Title';
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
