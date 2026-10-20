import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';
import { pool } from '../../apps/api/src/db/client.js';

describe('SceneSync End-to-End Full Flow', () => {
  const app = buildServer();
  let sessionId: string;
  let roomCode: string;
  let invitationToken: string;
  let hostMemberId: string;
  let phoneMemberId: string;

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  // 1 & 2: Launch Fire TV session, create party & display valid QR code
  it('1. Fire TV creates a watch party session with QR code and invitation token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        showId: 'show-aethelgard',
        hostDisplayName: 'Fire TV Living Room',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.session.id).toBeDefined();
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.joinUrl).toContain('/join?token=');
    expect(body.boundary.label).toContain('Not Started');

    sessionId = body.session.id;
    roomCode = body.session.roomCode;
    invitationToken = body.invitationToken;
    hostMemberId = body.hostMember.id;
  });

  // 3 & 4: Join using a phone browser & select initial viewing progress
  it('2. Phone browser scans QR token and joins with viewing progress S1 E6', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        invitationToken,
        displayName: 'Sarah (iPhone)',
        initialEpisodeId: 'ep-aeth-s1e6', // Sarah watched through E6
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.member.displayName).toBe('Sarah (iPhone)');
    expect(body.member.lastWatchedEpisodeId).toBe('ep-aeth-s1e6');

    phoneMemberId = body.member.id;
  });

  // 5: Verify the boundary on both clients
  it('3. Host declares S1 E8 -> Shared boundary synchronizes safely to S1 E6 (slowest viewer)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/progress`,
      headers: {
        'x-member-id': hostMemberId,
      },
      payload: {
        lastWatchedEpisodeId: 'ep-aeth-s1e8', // Host watched through E8
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.boundary.canonicalOrder).toBe(6);
    expect(body.boundary.boundaryEpisodeId).toBe('ep-aeth-s1e6');
    expect(body.boundary.label).toContain('S1 E6');
  });

  // 6: Start session & Generate recap
  it('4. Start session and generate recap strictly bounded through S1 E6', async () => {
    const startRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/start`,
    });
    expect(startRes.statusCode).toBe(200);

    const recapRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/recap`,
    });
    expect(recapRes.statusCode).toBe(200);
    const body = JSON.parse(recapRes.body);
    expect(body.recap.boundaryEpisodeId).toBe('ep-aeth-s1e6');
    expect(body.recap.body).toContain('S1 E6');
  });

  // 7 & 8: Submit question & display grounded, safe answer
  it('5. Companion phone submits question and receives verified grounded answer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/questions`,
      headers: {
        'x-member-id': phoneMemberId,
      },
      payload: {
        question: 'What happened to Lord Brandon Starkwell at Ravenfall?',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.answer.answerStatus).toBe('verified');
    expect(body.answer.evidenceIds).toContain('fact-602');
    expect(body.answer.answerBody).toContain('Lord Brandon');
  });

  // 9: Update progress and verify the boundary advances
  it('6. Sarah advances to S1 E8 -> Authoritative boundary advances to S1 E8', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/progress`,
      headers: {
        'x-member-id': phoneMemberId,
      },
      payload: {
        lastWatchedEpisodeId: 'ep-aeth-s1e8',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.boundary.canonicalOrder).toBe(8);
    expect(body.boundary.boundaryEpisodeId).toBe('ep-aeth-s1e8');
  });

  // 10: Disconnect / Reconnect / Leave participant
  it('7. Participant leaves -> Boundary recalculated atomically', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/leave`,
      headers: {
        'x-member-id': phoneMemberId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Sarah left, so only Host remains at E8
    expect(body.boundary.canonicalOrder).toBe(8);
    expect(body.boundary.eligibleMemberCount).toBe(1);
  });

  // 11: End the session
  it('8. Host ends the session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/end`,
    });

    expect(res.statusCode).toBe(200);

    // Verify session status is ended
    const stateRes = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
    });
    const stateBody = JSON.parse(stateRes.body);
    expect(stateBody.session.status).toBe('ended');
  });
});
