import {
  DetectedStreamingContext,
  ProviderCapabilities,
  StreamingProviderId,
} from '@scenesync/shared-types';

export interface StreamingProviderAdapter {
  readonly providerId: StreamingProviderId;
  readonly version: string;
  matches(url: URL): boolean;
  detectContext(doc?: Document): Promise<DetectedStreamingContext>;
  observePageChanges(callback: () => void, doc?: Document): () => void;
  getCapabilities(): ProviderCapabilities;
}
