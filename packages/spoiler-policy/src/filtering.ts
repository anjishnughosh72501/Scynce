import { Fact, Episode, BoundarySnapshot, EvidenceItem, Character } from '@scenesync/shared-types';

/**
 * Server-side Content Filtering Engine
 * Filters all factual records (plot events, character facts, relationships)
 * to strictly those established ON OR BEFORE the authoritative viewing boundary.
 *
 * Information from future episodes is physically excluded before reaching the AI.
 */
export function filterEligibleEvidence(
  facts: Fact[],
  episodes: Episode[],
  boundary: BoundarySnapshot,
  characters: Character[] = []
): EvidenceItem[] {
  // If party has not started or boundary is null, NO facts past "not started" are eligible
  if (!boundary.boundaryEpisodeId || boundary.canonicalOrder === null) {
    return [];
  }

  const episodeMap = new Map<string, Episode>();
  for (const ep of episodes) {
    episodeMap.set(ep.id, ep);
  }

  const charMap = new Map<string, Character>();
  for (const char of characters) {
    charMap.set(char.id, char);
  }

  const eligibleItems: EvidenceItem[] = [];

  for (const fact of facts) {
    // Only verified facts are considered
    if (fact.verificationStatus !== 'verified') {
      continue;
    }

    const episode = episodeMap.get(fact.episodeId);
    if (!episode) {
      continue;
    }

    // STRICT BOUNDARY CHECK: canonicalOrder must be <= boundary.canonicalOrder
    if (episode.canonicalOrder <= boundary.canonicalOrder) {
      const character = fact.characterId ? charMap.get(fact.characterId) : null;

      eligibleItems.push({
        id: fact.id,
        factText: fact.factText,
        episodeId: fact.episodeId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        canonicalOrder: episode.canonicalOrder,
        sourceId: fact.sourceId,
        characterName: character ? character.name : null,
      });
    }
  }

  return eligibleItems;
}
