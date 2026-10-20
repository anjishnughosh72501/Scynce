import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';
import { pool } from '../../apps/api/src/db/client.js';

describe('SceneSync End-to-End API Integration', () => {
  const app = buildServer();
  let sessionId: string;
  let invitationToken: string;
  let roomCode: string;
  let hostMemberId: string;
  let guestMemberId: string;

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('1. GET /api/shows returns the curated shows catalog', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/shows',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.shows.length).toBeGreaterThan(0);
    expect(body.shows[0].title).toBe('Chronicles of Aethelgard');
  });

  it('2. POST /api/sessions creates a session with QR code and initial Not-Started boundary', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        showId: 'show-aethelgard',
        hostDisplayName: 'FireTV Host (Rick)',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.session.id).toBeDefined();
    expect(body.roomCode).toBeDefined();
    expect(body.invitationToken).toBeDefined();
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(body.boundary.canonicalOrder).toBeNull(); // Host has not selected episode yet

    sessionId = body.session.id;
    invitationToken = body.invitationToken;
    roomCode = body.session.roomCode;
    hostMemberId = body.hostMember.id;
  });

  it('3. POST /api/sessions/join allows companion phone to join via invitation token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/join',
      payload: {
        invitationToken,
        displayName: 'Phone Guest (Sarah)',
        initialEpisodeId: 'ep-aeth-s1e6', // Sarah has watched through E6
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.member.displayName).toBe('Phone Guest (Sarah)');
    expect(body.member.lastWatchedEpisodeId).toBe('ep-aeth-s1e6');

    guestMemberId = body.member.id;
  });

  it('4. PATCH /api/sessions/:id/progress updates Host progress to E8 and establishes boundary E6', async () => {
    // Host sets watched progress to E8
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/progress`,
      headers: {
        'x-member-id': hostMemberId,
      },
      payload: {
        lastWatchedEpisodeId: 'ep-aeth-s1e8',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    // Sarah is at E6, Host is at E8 -> Minimum is E6
    expect(body.boundary.canonicalOrder).toBe(6);
    expect(body.boundary.boundaryEpisodeId).toBe('ep-aeth-s1e6');
    expect(body.boundary.label).toContain('S1 E6');
  });

  it('5. POST /api/sessions/:id/recap generates safe recap grounded through E6', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/recap`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.recap.boundaryEpisodeId).toBe('ep-aeth-s1e6');
    expect(body.recap.evidenceIds.length).toBeGreaterThan(0);
  });

  it('6. POST /api/sessions/:id/questions answers verified safe question citing E6 evidence', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/questions`,
      headers: {
        'x-member-id': guestMemberId,
      },
      payload: {
        question: 'What is the secret of Elena Vance pendant?',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.answer.answerStatus).toBe('verified');
    expect(body.answer.evidenceIds).toContain('fact-601');
    expect(body.answer.answerBody).toContain('silver serpent pendant');
  });

  it('7. POST /api/sessions/:id/questions safely refuses future episode spoiler', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/questions`,
      headers: {
        'x-member-id': guestMemberId,
      },
      payload: {
        question: 'Who poisoned the central reservoir?', // Occurs in E9!
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.answer.answerStatus).toBe('insufficient_evidence');
    expect(body.answer.evidenceIds).toHaveLength(0);
    expect(body.answer.answerBody).toContain("I can't verify an answer using information your group has watched so far.");
  });

  it('8. Advancing Sarah to E8 updates boundary to E8', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/sessions/${sessionId}/progress`,
      headers: {
        'x-member-id': guestMemberId,
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
});
