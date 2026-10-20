import { describe, it, expect } from 'vitest';
import { calculateAuthoritativeBoundary, BoundaryCalculationError } from '@scenesync/spoiler-policy';
import { Episode, SessionMember } from '@scenesync/shared-types';

describe('Authoritative Boundary Policy Engine', () => {
  // Test Episodes spanning 2 seasons to test cross-season ordering
  const testEpisodes: Episode[] = [
    { id: 'ep-s1e1', showId: 'show-1', seasonNumber: 1, episodeNumber: 1, title: 'Pilot', canonicalOrder: 1, contentStatus: 'ready' },
    { id: 'ep-s1e2', showId: 'show-1', seasonNumber: 1, episodeNumber: 2, title: 'Ep 2', canonicalOrder: 2, contentStatus: 'ready' },
    { id: 'ep-s1e5', showId: 'show-1', seasonNumber: 1, episodeNumber: 5, title: 'Ep 5', canonicalOrder: 5, contentStatus: 'ready' },
    { id: 'ep-s1e6', showId: 'show-1', seasonNumber: 1, episodeNumber: 6, title: 'Ep 6', canonicalOrder: 6, contentStatus: 'ready' },
    { id: 'ep-s1e7', showId: 'show-1', seasonNumber: 1, episodeNumber: 7, title: 'Ep 7', canonicalOrder: 7, contentStatus: 'ready' },
    { id: 'ep-s1e8', showId: 'show-1', seasonNumber: 1, episodeNumber: 8, title: 'Ep 8', canonicalOrder: 8, contentStatus: 'ready' },
    { id: 'ep-s1e10', showId: 'show-1', seasonNumber: 1, episodeNumber: 10, title: 'S1 Finale', canonicalOrder: 10, contentStatus: 'ready' },
    { id: 'ep-s2e1', showId: 'show-1', seasonNumber: 2, episodeNumber: 1, title: 'S2 Premiere', canonicalOrder: 11, contentStatus: 'ready' },
    { id: 'ep-s2e2', showId: 'show-1', seasonNumber: 2, episodeNumber: 2, title: 'S2 Ep 2', canonicalOrder: 12, contentStatus: 'ready' },
  ];

  const createMember = (
    id: string,
    displayName: string,
    lastWatchedEpisodeId: string | null,
    status: 'active' | 'disconnected' | 'left' = 'active'
  ): SessionMember => ({
    id,
    sessionId: 'sess-1',
    anonymousIdentity: `anon-${id}`,
    displayName,
    lastWatchedEpisodeId,
    role: id === 'm-1' ? 'host' : 'guest',
    status,
    joinedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });

  // Test 1: Participants at E6, E8 and E10 produce boundary E6
  it('1. Participants at E6, E8, and E10 strictly produce boundary E6', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-s1e6'),
      createMember('m-2', 'Bob', 'ep-s1e8'),
      createMember('m-3', 'Charlie', 'ep-s1e10'),
    ];

    const boundary = calculateAuthoritativeBoundary(testEpisodes, members);

    expect(boundary.boundaryEpisodeId).toBe('ep-s1e6');
    expect(boundary.canonicalOrder).toBe(6);
    expect(boundary.seasonNumber).toBe(1);
    expect(boundary.episodeNumber).toBe(6);
    expect(boundary.isSafe).toBe(true);
  });

  // Test 2: When all participants reach E7, the boundary advances to E7
  it('2. Advances to E7 when all eligible participants have reached at least E7', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-s1e7'),
      createMember('m-2', 'Bob', 'ep-s1e8'),
      createMember('m-3', 'Charlie', 'ep-s1e10'),
    ];

    const boundary = calculateAuthoritativeBoundary(testEpisodes, members);

    expect(boundary.boundaryEpisodeId).toBe('ep-s1e7');
    expect(boundary.canonicalOrder).toBe(7);
  });

  // Test 3: A participant regressing from E8 to E5 lowers the boundary to E5
  it('3. A participant regressing from E8 to E5 lowers the boundary to E5', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-s1e6'),
      createMember('m-2', 'Bob', 'ep-s1e5'), // regressed or corrected
      createMember('m-3', 'Charlie', 'ep-s1e10'),
    ];

    const boundary = calculateAuthoritativeBoundary(testEpisodes, members);

    expect(boundary.boundaryEpisodeId).toBe('ep-s1e5');
    expect(boundary.canonicalOrder).toBe(5);
  });

  // Test 4: A not-started participant prevents a positive boundary
  it('4. A not-started participant (null progress) prevents a positive boundary', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-s1e6'),
      createMember('m-2', 'Bob', null), // Not started!
      createMember('m-3', 'Charlie', 'ep-s1e10'),
    ];

    const boundary = calculateAuthoritativeBoundary(testEpisodes, members);

    expect(boundary.boundaryEpisodeId).toBeNull();
    expect(boundary.canonicalOrder).toBeNull();
    expect(boundary.label).toContain('Not Started');
  });

  // Test 5: Cross-season comparisons use canonical ordering
  it('5. Cross-season comparisons strictly use canonical ordering, not string parsing', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-s1e10'), // Canonical order 10
      createMember('m-2', 'Bob', 'ep-s2e1'),   // Canonical order 11
    ];

    const boundary = calculateAuthoritativeBoundary(testEpisodes, members);

    // E10 of S1 (10) < E1 of S2 (11)
    expect(boundary.boundaryEpisodeId).toBe('ep-s1e10');
    expect(boundary.canonicalOrder).toBe(10);
  });

  // Test 6: Invalid or unknown episode IDs fail safely
  it('6. Invalid or unknown episode IDs cause safe fail-closed behavior', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-nonexistent-999'),
      createMember('m-2', 'Bob', 'ep-s1e8'),
    ];

    expect(() => calculateAuthoritativeBoundary(testEpisodes, members)).toThrowError(
      BoundaryCalculationError
    );
  });

  // Test 7: Membership removal triggers recalculated boundary
  it('7. Leaving members are excluded from boundary calculation', () => {
    const members: SessionMember[] = [
      createMember('m-1', 'Alice', 'ep-s1e6', 'left'), // Left the party
      createMember('m-2', 'Bob', 'ep-s1e8', 'active'),
      createMember('m-3', 'Charlie', 'ep-s1e10', 'active'),
    ];

    const boundary = calculateAuthoritativeBoundary(testEpisodes, members);

    // Alice left, so the minimum of active members Bob (8) and Charlie (10) is 8
    expect(boundary.boundaryEpisodeId).toBe('ep-s1e8');
    expect(boundary.canonicalOrder).toBe(8);
  });

  // Test 8: Disconnected participant grace period protection
  it('8. Disconnected member within grace period is preserved to prevent spoilers', () => {
    const recentLastSeen = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    const member: SessionMember = {
      ...createMember('m-1', 'Alice', 'ep-s1e6', 'disconnected'),
      lastSeenAt: recentLastSeen,
    };

    const boundary = calculateAuthoritativeBoundary(
      testEpisodes,
      [member, createMember('m-2', 'Bob', 'ep-s1e10')],
      { disconnectGracePeriodMs: 5 * 60 * 1000 }
    );

    // Alice is disconnected but within 5 min grace, so boundary remains safe at E6
    expect(boundary.boundaryEpisodeId).toBe('ep-s1e6');
  });
});
