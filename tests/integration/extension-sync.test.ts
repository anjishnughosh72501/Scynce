import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';
import { pool } from '../../apps/api/src/db/client.js';

describe('Cross-Surface Extension & Companion Watch-Party Sync', () => {
  const app = buildServer();
  let sessionId: string;
  let hostMemberId: string;
  let guestMemberId: string;
  const installationId = 'ext-inst-' + Date.now();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('1. Prepares a session with Host on Fire TV and Member on Phone', async () => {
    // 1. Create session (Host on TV)
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        showId: 'show-aethelgard',
        hostDisplayName: 'Living Room TV',
      },
    });
    expect(sessionRes.statusCode).toBe(201);
    const sessionBody = JSON.parse(sessionRes.body);
    sessionId = sessionBody.session.id;
    hostMemberId = sessionBody.hostMember.id;

    // 2. Host advances to E8
    await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/progress`,
      headers: { 'x-member-id': hostMemberId },
      payload: { lastWatchedEpisodeId: 'ep-aeth-s1e8' },
    });

    // 3. Companion Phone joins and sets progress to E6
    const joinRes = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        invitationToken: sessionBody.invitationToken,
        displayName: 'Sarah (Companion Phone)',
        initialEpisodeId: 'ep-aeth-s1e6',
      },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinBody = JSON.parse(joinRes.body);
    guestMemberId = joinBody.member.id;
  });

  it('2. POST /api/extensions/link links a desktop browser extension to the session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extensions/link',
      payload: {
        installationId,
        ownerId: guestMemberId,
        sessionId,
        providerId: 'netflix',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.linking.installationId).toBe(installationId);
    expect(body.linking.sessionId).toBe(sessionId);
    expect(body.linking.connectionStatus).toBe('connected');
    expect(body.sessionState).toBeDefined();
    expect(body.sessionState.boundary.canonicalOrder).toBe(6);
  });

  it('3. GET /api/sessions/:id/extensions lists the linked desktop extension', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/extensions`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.extensions.length).toBeGreaterThanOrEqual(1);

    const linked = body.extensions.find((e: any) => e.installationId === installationId);
    expect(linked).toBeDefined();
    expect(linked.providerId).toBe('netflix');
  });

  it('4. POST /api/extensions/:id/context records detected stream from Netflix adapter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/extensions/${installationId}/context`,
      payload: {
        context: {
          providerId: 'netflix',
          showTitle: 'Chronicles of Aethelgard',
          seasonNumber: 1,
          episodeNumber: 6,
          episodeTitle: 'The Siege of Ravenfall',
          canonicalContentId: '80123456',
          detectionMethod: 'dom_player',
          confidence: 0.85,
          lastDetectedAt: new Date().toISOString(),
        },
        isConfirmed: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.linking.detectedContentContext.showTitle).toBe('Chronicles of Aethelgard');
    expect(body.linking.detectedContentContext.episodeNumber).toBe(6);
    expect(body.linking.detectedContentContext.confidence).toBe(0.85);
  });

  it('5. Phone Companion confirms / overrides extension playback context', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/extensions/${installationId}/context`,
      payload: {
        context: {
          providerId: 'netflix',
          showTitle: 'Chronicles of Aethelgard',
          seasonNumber: 1,
          episodeNumber: 6,
          episodeTitle: 'The Siege of Ravenfall',
          canonicalContentId: '80123456',
          detectionMethod: 'manual_confirmed',
          confidence: 1.0,
          lastDetectedAt: new Date().toISOString(),
        },
        isConfirmed: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.linking.confirmedContentContext).toBeDefined();
    expect(body.linking.confirmedContentContext.detectionMethod).toBe('manual_confirmed');
    expect(body.linking.confirmedContentContext.confidence).toBe(1.0);
  });

  it('6. POST /api/sessions/:id/extensions/command dispatches typed command to extension', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/extensions/command`,
      headers: { 'x-member-id': guestMemberId },
      payload: {
        type: 'SET_CONTENT_CONTEXT',
        payload: {
          providerId: 'netflix',
          showTitle: 'Chronicles of Aethelgard',
          seasonNumber: 1,
          episodeNumber: 6,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.command.commandId).toBeDefined();
    expect(body.command.type).toBe('SET_CONTENT_CONTEXT');
    expect(body.command.issuedBy).toBe(guestMemberId);
    expect(body.command.payload.episodeNumber).toBe(6);
  });

  it('7. Submitting question from extension enforces authoritative boundary and records destination', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/questions`,
      headers: { 'x-member-id': guestMemberId },
      payload: {
        question: 'Who broke the treaty at Ravenfall in Episode 6?',
        destination: 'sidepanel',
        sourceClient: 'extension',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.answer.destination).toBe('sidepanel');
    expect(body.answer.sourceClient).toBe('extension');
    // Grounded through E6
    expect(body.answer.boundarySnapshot.canonicalOrder).toBe(6);
    expect(body.answer.answerStatus).toBe('verified');
    expect(body.answer.evidenceIds.length).toBeGreaterThan(0);
  });

  it('8. POST /api/extensions/:id/revoke cleans up active extension association', async () => {
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/extensions/${installationId}/revoke`,
    });
    expect(revokeRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}/extensions`,
    });
    const listBody = JSON.parse(listRes.body);
    const found = listBody.extensions.find((e: any) => e.installationId === installationId);
    expect(found).toBeUndefined();
  });
});
