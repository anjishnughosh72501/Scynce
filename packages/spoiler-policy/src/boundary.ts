import { Episode, SessionMember, BoundarySnapshot } from '@scenesync/shared-types';

export interface BoundaryCalculationOptions {
  disconnectGracePeriodMs?: number; // e.g. 5 mins = 300,000 ms
  now?: Date;
  previousVersion?: number;
}

export class BoundaryCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BoundaryCalculationError';
  }
}

/**
 * Calculates the authoritative viewing boundary for a watch party.
 * Strictly enforces:
 * 1. Episode ordering based on integer canonicalOrder, never string comparisons.
 * 2. Minimum valid progress across all eligible members.
 * 3. Safe fail-closed handling if any member has "not started" (null) or invalid episode.
 * 4. Disconnect grace periods to prevent silent dropouts from leaking spoilers.
 */
export function calculateAuthoritativeBoundary(
  episodes: Episode[],
  members: SessionMember[],
  options: BoundaryCalculationOptions = {}
): BoundarySnapshot {
  const now = options.now || new Date();
  const gracePeriodMs = options.disconnectGracePeriodMs ?? 5 * 60 * 1000; // 5 min default
  const previousVersion = options.previousVersion ?? 1;

  if (!episodes || episodes.length === 0) {
    throw new BoundaryCalculationError('Cannot calculate boundary: no episodes provided for show');
  }

  // Create fast lookup map for episodes
  const episodeMap = new Map<string, Episode>();
  for (const ep of episodes) {
    episodeMap.set(ep.id, ep);
  }

  // Filter eligible members
  const eligibleMembers = members.filter((m) => {
    // Left members are not eligible
    if (m.status === 'left') {
      return false;
    }
    // Active members are eligible
    if (m.status === 'active') {
      return true;
    }
    // Disconnected members: check grace period
    if (m.status === 'disconnected') {
      const lastSeen = new Date(m.lastSeenAt).getTime();
      const isWithinGrace = now.getTime() - lastSeen <= gracePeriodMs;
      return isWithinGrace;
    }
    return false;
  });

  // If no eligible members currently in session, fail safe to Not Started
  if (eligibleMembers.length === 0) {
    return {
      boundaryEpisodeId: null,
      seasonNumber: null,
      episodeNumber: null,
      canonicalOrder: null,
      boundaryVersion: previousVersion,
      calculatedAt: now.toISOString(),
      eligibleMemberCount: 0,
      isSafe: true,
      label: 'No active participants (Not Started)',
    };
  }

  // Check if ANY eligible member has not started (null episode)
  const hasNotStartedMember = eligibleMembers.some((m) => m.lastWatchedEpisodeId === null);
  if (hasNotStartedMember) {
    return {
      boundaryEpisodeId: null,
      seasonNumber: null,
      episodeNumber: null,
      canonicalOrder: null,
      boundaryVersion: previousVersion,
      calculatedAt: now.toISOString(),
      eligibleMemberCount: eligibleMembers.length,
      isSafe: true,
      label: 'Safe: Participant has Not Started',
    };
  }

  // Find minimum canonical progress
  let minOrder = Infinity;
  let minEpisode: Episode | null = null;

  for (const member of eligibleMembers) {
    const epId = member.lastWatchedEpisodeId!;
    const episode = episodeMap.get(epId);

    if (!episode) {
      // Invalid or unknown episode ID! Fail closed!
      throw new BoundaryCalculationError(
        `Invalid episode ID "${epId}" reported for member "${member.displayName}". Failing closed.`
      );
    }

    if (episode.canonicalOrder < minOrder) {
      minOrder = episode.canonicalOrder;
      minEpisode = episode;
    }
  }

  if (!minEpisode) {
    throw new BoundaryCalculationError('Failed to determine minimum episode boundary');
  }

  const label = `Safe through S${minEpisode.seasonNumber} E${minEpisode.episodeNumber}: ${minEpisode.title}`;

  return {
    boundaryEpisodeId: minEpisode.id,
    seasonNumber: minEpisode.seasonNumber,
    episodeNumber: minEpisode.episodeNumber,
    canonicalOrder: minEpisode.canonicalOrder,
    boundaryVersion: previousVersion,
    calculatedAt: now.toISOString(),
    eligibleMemberCount: eligibleMembers.length,
    isSafe: true,
    label,
  };
}
