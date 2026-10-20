import { describe, it, expect } from 'vitest';
import {
  StreamingAdapterRegistry,
  NetflixAdapter,
  PrimeVideoAdapter,
  HotstarAdapter,
  FallbackAdapter,
} from '../../apps/extension/src/adapters/index.js';

describe('Streaming Provider Adapters & Registry', () => {
  const registry = new StreamingAdapterRegistry();

  describe('Registry URL Matching', () => {
    it('1. Correctly resolves Netflix URLs to NetflixAdapter', () => {
      const adapter1 = registry.getAdapterForUrl(new URL('https://www.netflix.com/watch/80057281'));
      const adapter2 = registry.getAdapterForUrl(new URL('https://netflix.com/title/70143836'));

      expect(adapter1).toBeInstanceOf(NetflixAdapter);
      expect(adapter1.providerId).toBe('netflix');
      expect(adapter2).toBeInstanceOf(NetflixAdapter);
    });

    it('2. Correctly resolves Prime Video URLs to PrimeVideoAdapter', () => {
      const adapter1 = registry.getAdapterForUrl(new URL('https://www.primevideo.com/detail/0STG0001'));
      const adapter2 = registry.getAdapterForUrl(new URL('https://www.amazon.com/gp/video/detail/B08X'));

      expect(adapter1).toBeInstanceOf(PrimeVideoAdapter);
      expect(adapter1.providerId).toBe('prime-video');
      expect(adapter2).toBeInstanceOf(PrimeVideoAdapter);
    });

    it('3. Correctly resolves Hotstar & JioStar URLs to HotstarAdapter', () => {
      const adapter1 = registry.getAdapterForUrl(new URL('https://www.hotstar.com/in/shows/aethelgard/12345'));
      const adapter2 = registry.getAdapterForUrl(new URL('https://www.jiostar.com/in/shows/aethelgard/12345'));

      expect(adapter1).toBeInstanceOf(HotstarAdapter);
      expect(adapter1.providerId).toBe('hotstar');
      expect(adapter2).toBeInstanceOf(HotstarAdapter);
    });

    it('4. Falls back to FallbackAdapter for unsupported domains', () => {
      const adapter = registry.getAdapterForUrl(new URL('https://www.hulu.com/watch/12345'));

      expect(adapter).toBeInstanceOf(FallbackAdapter);
      expect(adapter.providerId).toBe('fallback');
    });

    it('5. getAdapterById returns the exact registered adapter', () => {
      expect(registry.getAdapterById('netflix')).toBeInstanceOf(NetflixAdapter);
      expect(registry.getAdapterById('prime-video')).toBeInstanceOf(PrimeVideoAdapter);
      expect(registry.getAdapterById('hotstar')).toBeInstanceOf(HotstarAdapter);
      expect(registry.getAdapterById('unknown-provider')).toBeInstanceOf(FallbackAdapter);
    });
  });

  describe('Provider Capabilities', () => {
    it('6. Reports accurate capabilities across all providers', () => {
      const netflix = new NetflixAdapter();
      const prime = new PrimeVideoAdapter();
      const hotstar = new HotstarAdapter();
      const fallback = new FallbackAdapter();

      expect(netflix.getCapabilities().canDetectShowTitle).toBe(true);
      expect(netflix.getCapabilities().canDetectEpisode).toBe(true);
      expect(netflix.getCapabilities().supportedDomains).toContain('netflix.com');

      expect(prime.getCapabilities().supportedDomains).toContain('primevideo.com');
      expect(prime.getCapabilities().requiresManualConfirmation).toBe(true);

      expect(hotstar.getCapabilities().supportedDomains).toContain('hotstar.com');

      expect(fallback.getCapabilities().verificationStatus).toBe('verified_manual_fallback');
      expect(fallback.getCapabilities().canDetectEpisode).toBe(false);
    });
  });

  describe('NetflixAdapter Context Detection', () => {
    const adapter = new NetflixAdapter();

    it('7. Parses player DOM for show title, season, and episode', async () => {
      const mockDoc = {
        location: { href: 'https://www.netflix.com/watch/80123456' },
        querySelector: (selector: string) => {
          if (selector === '[data-uia="video-title"]') {
            return { textContent: 'Chronicles of Aethelgard S1:E6 The Siege of Ravenfall' };
          }
          return null;
        },
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.providerId).toBe('netflix');
      expect(result.showTitle).toBe('Chronicles of Aethelgard');
      expect(result.seasonNumber).toBe(1);
      expect(result.episodeNumber).toBe(6);
      expect(result.canonicalContentId).toBe('80123456');
      expect(result.detectionMethod).toBe('dom_player');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('8. Falls back to document.title when player DOM is absent', async () => {
      const mockDoc = {
        location: { href: 'https://www.netflix.com/title/80123456' },
        title: 'Chronicles of Aethelgard - Netflix',
        querySelector: () => null,
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.showTitle).toBe('Chronicles of Aethelgard');
      expect(result.seasonNumber).toBeNull();
      expect(result.detectionMethod).toBe('dom_metadata');
      expect(result.confidence).toBe(0.6);
    });

    it('9. Handles missing DOM gracefully without throwing', async () => {
      const mockDoc = {
        location: { href: 'https://www.netflix.com' },
        querySelector: () => null,
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.showTitle).toBe('Unknown Netflix Title');
      expect(result.detectionMethod).toBe('unverified');
      expect(result.confidence).toBe(0.2);
    });
  });

  describe('PrimeVideoAdapter Context Detection', () => {
    const adapter = new PrimeVideoAdapter();

    it('10. Parses Prime Video title, season/episode and detail ID', async () => {
      const mockDoc = {
        location: { href: 'https://www.primevideo.com/detail/amzn1.dv.gti.12345' },
        querySelector: (selector: string) => {
          if (selector === '[data-automation-id="title"]') {
            return { textContent: 'Chronicles of Aethelgard' };
          }
          if (selector === '[data-automation-id="subtitle"]') {
            return { textContent: 'Season 1, Ep 6 "The Siege of Ravenfall"' };
          }
          return null;
        },
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.providerId).toBe('prime-video');
      expect(result.showTitle).toBe('Chronicles of Aethelgard');
      expect(result.seasonNumber).toBe(1);
      expect(result.episodeNumber).toBe(6);
      expect(result.canonicalContentId).toBe('amzn1.dv.gti.12345');
      expect(result.detectionMethod).toBe('dom_player');
    });

    it('11. Degrades to document.title if DOM player is not rendered', async () => {
      const mockDoc = {
        location: { href: 'https://www.primevideo.com' },
        title: 'Watch Chronicles of Aethelgard | Prime Video',
        querySelector: () => null,
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.showTitle).toBe('Chronicles of Aethelgard');
      expect(result.detectionMethod).toBe('dom_metadata');
    });
  });

  describe('HotstarAdapter Context Detection', () => {
    const adapter = new HotstarAdapter();

    it('12. Parses Hotstar DOM player and episode metadata', async () => {
      const mockDoc = {
        location: { href: 'https://www.hotstar.com/in/shows/chronicles-of-aethelgard/12345/watch/67890' },
        querySelector: (selector: string) => {
          if (selector === '.show-title') {
            return { textContent: 'Chronicles of Aethelgard' };
          }
          if (selector === '.episode-title') {
            return { textContent: 'S1 E6 The Siege of Ravenfall' };
          }
          return null;
        },
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.providerId).toBe('hotstar');
      expect(result.showTitle).toBe('Chronicles of Aethelgard');
      expect(result.seasonNumber).toBe(1);
      expect(result.episodeNumber).toBe(6);
      expect(result.canonicalContentId).toBe('67890');
    });
  });

  describe('FallbackAdapter', () => {
    const adapter = new FallbackAdapter();

    it('13. Reads OpenGraph meta tag if available on unknown stream site', async () => {
      const mockDoc = {
        querySelector: (selector: string) => {
          if (selector === 'meta[property="og:title"]') {
            return { getAttribute: () => 'Chronicles of Aethelgard' };
          }
          return null;
        },
      };

      const result = await adapter.detectContext(mockDoc as any);

      expect(result.providerId).toBe('fallback');
      expect(result.showTitle).toBe('Chronicles of Aethelgard');
      expect(result.detectionMethod).toBe('dom_metadata');
    });

    it('14. Degrades safely to document.title or Unrecognized Stream', async () => {
      const mockDoc1 = {
        title: 'Custom Player Stream',
        querySelector: () => null,
      };
      const result1 = await adapter.detectContext(mockDoc1 as any);
      expect(result1.showTitle).toBe('Custom Player Stream');

      const mockDoc2 = {
        querySelector: () => null,
      };
      const result2 = await adapter.detectContext(mockDoc2 as any);
      expect(result2.showTitle).toBe('Unrecognized Stream');
      expect(result2.detectionMethod).toBe('unverified');
    });
  });

  describe('Observer Edge Cases', () => {
    it('15. observePageChanges safely returns no-op when body is absent', () => {
      const netflix = new NetflixAdapter();
      const prime = new PrimeVideoAdapter();
      const hotstar = new HotstarAdapter();

      const cleanup1 = netflix.observePageChanges(() => {}, { body: null } as any);
      const cleanup2 = prime.observePageChanges(() => {}, { body: null } as any);
      const cleanup3 = hotstar.observePageChanges(() => {}, { body: null } as any);

      expect(typeof cleanup1).toBe('function');
      expect(typeof cleanup2).toBe('function');
      expect(typeof cleanup3).toBe('function');
      expect(() => {
        cleanup1();
        cleanup2();
        cleanup3();
      }).not.toThrow();
    });
  });
});
