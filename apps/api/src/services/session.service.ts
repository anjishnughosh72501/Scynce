import crypto from 'crypto';
import QRCode from 'qrcode';
import { pool, withTransaction } from '../db/client.js';
import {
  Session,
  SessionMember,
  BoundarySnapshot,
  Episode,
} from '@scenesync/shared-types';
import { calculateAuthoritativeBoundary } from '@scenesync/spoiler-policy';
import { nanoid } from 'nanoid';

const COMPANION_BASE_URL = process.env.COMPANION_BASE_URL || 'http://localhost:3000';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface CreateSessionResult {
  session: Session;
  hostMember: SessionMember;
  invitationToken: string;
  joinUrl: string;
  qrCodeDataUrl: string;
  boundary: BoundarySnapshot;
}

export class SessionService {
  async getEpisodesForShow(showId: string): Promise<Episode[]> {
    const res = await pool.query<any>(
      `SELECT id, show_id as "showId", season_number as "seasonNumber",
              episode_number as "episodeNumber", title, canonical_order as "canonicalOrder",
              content_status as "contentStatus"
       FROM episodes
       WHERE show_id = $1
       ORDER BY canonical_order ASC`,
      [showId]
    );
    return res.rows;
  }

  async getSessionMembers(sessionId: string): Promise<SessionMember[]> {
    const res = await pool.query<any>(
      `SELECT id, session_id as "sessionId", anonymous_identity as "anonymousIdentity",
              display_name as "displayName", last_watched_episode_id as "lastWatchedEpisodeId",
              role, status, joined_at as "joinedAt", last_seen_at as "lastSeenAt"
       FROM session_members
       WHERE session_id = $1
       ORDER BY joined_at ASC`,
      [sessionId]
    );
    return res.rows;
  }

  async createSession(showId: string, hostDisplayName: string): Promise<CreateSessionResult> {
    const sessionId = `sess_${nanoid(12)}`;
    const hostMemberId = `mem_${nanoid(12)}`;
    const hostIdentity = `anon_${nanoid(16)}`;
    const roomCode = generateRoomCode();
    const rawInvitationToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashToken(rawInvitationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const joinUrl = `${COMPANION_BASE_URL}/join?token=${rawInvitationToken}`;
    const qrCodeDataUrl = await QRCode.toDataURL(joinUrl, { width: 320, margin: 2 });

    const episodes = await this.getEpisodesForShow(showId);
    if (episodes.length === 0) {
      throw new Error(`Show ${showId} has no episodes in catalog`);
    }

    const hostMember: SessionMember = {
      id: hostMemberId,
      sessionId,
      anonymousIdentity: hostIdentity,
      displayName: hostDisplayName,
      lastWatchedEpisodeId: null, // Host can select during session or starts at null
      role: 'host',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    const initialBoundary = calculateAuthoritativeBoundary(episodes, [hostMember], {
      previousVersion: 1,
    });

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO sessions (id, room_code, show_id, host_id, status, boundary_episode_id, boundary_version, invitation_token_hash, expires_at)
         VALUES ($1, $2, $3, $4, 'lobby', $5, $6, $7, $8)`,
        [
          sessionId,
          roomCode,
          showId,
          hostMemberId,
          initialBoundary.boundaryEpisodeId,
          initialBoundary.boundaryVersion,
          tokenHash,
          expiresAt,
        ]
      );

      await client.query(
        `INSERT INTO session_members (id, session_id, anonymous_identity, display_name, last_watched_episode_id, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          hostMember.id,
          hostMember.sessionId,
          hostMember.anonymousIdentity,
          hostMember.displayName,
          hostMember.lastWatchedEpisodeId,
          hostMember.role,
          hostMember.status,
        ]
      );
    });

    const session: Session = {
      id: sessionId,
      roomCode,
      showId,
      hostId: hostMemberId,
      status: 'lobby',
      boundaryEpisodeId: initialBoundary.boundaryEpisodeId,
      boundaryVersion: initialBoundary.boundaryVersion,
      invitationTokenHash: tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    return {
      session,
      hostMember,
      invitationToken: rawInvitationToken,
      joinUrl,
      qrCodeDataUrl,
      boundary: initialBoundary,
    };
  }

  async joinSession(params: {
    invitationToken?: string;
    roomCode?: string;
    displayName: string;
    initialEpisodeId?: string | null;
  }): Promise<{ session: Session; member: SessionMember; boundary: BoundarySnapshot }> {
    let sessionRow: any = null;

    if (params.invitationToken) {
      const tokenHash = hashToken(params.invitationToken);
      const res = await pool.query(
        `SELECT id, room_code as "roomCode", show_id as "showId", host_id as "hostId",
                status, boundary_episode_id as "boundaryEpisodeId", boundary_version as "boundaryVersion",
                invitation_token_hash as "invitationTokenHash", expires_at as "expiresAt",
                created_at as "createdAt"
         FROM sessions
         WHERE invitation_token_hash = $1`,
        [tokenHash]
      );
      sessionRow = res.rows[0];
    } else if (params.roomCode) {
      const cleanCode = params.roomCode.trim().toUpperCase();
      const res = await pool.query(
        `SELECT id, room_code as "roomCode", show_id as "showId", host_id as "hostId",
                status, boundary_episode_id as "boundaryEpisodeId", boundary_version as "boundaryVersion",
                invitation_token_hash as "invitationTokenHash", expires_at as "expiresAt",
                created_at as "createdAt"
         FROM sessions
         WHERE room_code = $1`,
        [cleanCode]
      );
      sessionRow = res.rows[0];
    }

    if (!sessionRow) {
      throw new Error('Watch party not found. Check your room code or invitation link.');
    }

    if (new Date(sessionRow.expiresAt).getTime() < Date.now()) {
      throw new Error('This watch party session has expired.');
    }

    if (sessionRow.status === 'ended') {
      throw new Error('This watch party has already ended.');
    }

    const memberId = `mem_${nanoid(12)}`;
    const anonymousIdentity = `anon_${nanoid(16)}`;
    const initialEpisode = params.initialEpisodeId || null;

    const episodes = await this.getEpisodesForShow(sessionRow.showId);

    // Verify initialEpisode exists if provided
    if (initialEpisode) {
      const epExists = episodes.some((e) => e.id === initialEpisode);
      if (!epExists) {
        throw new Error(`Invalid episode selected: ${initialEpisode}`);
      }
    }

    const newMember: SessionMember = {
      id: memberId,
      sessionId: sessionRow.id,
      anonymousIdentity,
      displayName: params.displayName.trim(),
      lastWatchedEpisodeId: initialEpisode,
      role: 'guest',
      status: 'active',
      joinedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    const updatedBoundary = await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO session_members (id, session_id, anonymous_identity, display_name, last_watched_episode_id, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newMember.id,
          newMember.sessionId,
          newMember.anonymousIdentity,
          newMember.displayName,
          newMember.lastWatchedEpisodeId,
          newMember.role,
          newMember.status,
        ]
      );

      // Fetch all members to recalculate boundary
      const allMembersRes = await client.query<any>(
        `SELECT id, session_id as "sessionId", anonymous_identity as "anonymousIdentity",
                display_name as "displayName", last_watched_episode_id as "lastWatchedEpisodeId",
                role, status, joined_at as "joinedAt", last_seen_at as "lastSeenAt"
         FROM session_members
         WHERE session_id = $1`,
        [sessionRow.id]
      );

      const nextVersion = Number(sessionRow.boundaryVersion) + 1;
      const boundary = calculateAuthoritativeBoundary(episodes, allMembersRes.rows, {
        previousVersion: nextVersion,
      });

      await client.query(
        `UPDATE sessions
         SET boundary_episode_id = $1, boundary_version = $2
         WHERE id = $3`,
        [boundary.boundaryEpisodeId, boundary.boundaryVersion, sessionRow.id]
      );

      return boundary;
    });

    sessionRow.boundaryEpisodeId = updatedBoundary.boundaryEpisodeId;
    sessionRow.boundaryVersion = updatedBoundary.boundaryVersion;

    return {
      session: sessionRow,
      member: newMember,
      boundary: updatedBoundary,
    };
  }

  async updateMemberProgress(
    sessionId: string,
    memberId: string,
    episodeId: string | null
  ): Promise<{ boundary: BoundarySnapshot; member: SessionMember }> {
    const sessionRes = await pool.query(
      `SELECT id, show_id as "showId", boundary_version as "boundaryVersion", status FROM sessions WHERE id = $1`,
      [sessionId]
    );
    const session = sessionRes.rows[0];
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status === 'ended') {
      throw new Error('Cannot update progress in an ended session');
    }

    const episodes = await this.getEpisodesForShow(session.showId);
    if (episodeId !== null) {
      const epExists = episodes.some((e) => e.id === episodeId);
      if (!epExists) {
        throw new Error(`Episode "${episodeId}" does not belong to this show`);
      }
    }

    return await withTransaction(async (client) => {
      const updateRes = await client.query(
        `UPDATE session_members
         SET last_watched_episode_id = $1, last_seen_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND session_id = $3
         RETURNING id, session_id as "sessionId", anonymous_identity as "anonymousIdentity",
                   display_name as "displayName", last_watched_episode_id as "lastWatchedEpisodeId",
                   role, status, joined_at as "joinedAt", last_seen_at as "lastSeenAt"`,
        [episodeId, memberId, sessionId]
      );

      if (updateRes.rowCount === 0) {
        throw new Error('Member not found in session');
      }

      const updatedMember = updateRes.rows[0] as SessionMember;

      // Recalculate authoritative boundary across all members
      const allMembersRes = await client.query<any>(
        `SELECT id, session_id as "sessionId", anonymous_identity as "anonymousIdentity",
                display_name as "displayName", last_watched_episode_id as "lastWatchedEpisodeId",
                role, status, joined_at as "joinedAt", last_seen_at as "lastSeenAt"
         FROM session_members
         WHERE session_id = $1`,
        [sessionId]
      );

      const nextVersion = Number(session.boundaryVersion) + 1;
      const boundary = calculateAuthoritativeBoundary(episodes, allMembersRes.rows, {
        previousVersion: nextVersion,
      });

      await client.query(
        `UPDATE sessions
         SET boundary_episode_id = $1, boundary_version = $2
         WHERE id = $3`,
        [boundary.boundaryEpisodeId, boundary.boundaryVersion, sessionId]
      );

      return { boundary, member: updatedMember };
    });
  }

  async getSessionState(sessionId: string): Promise<{
    session: Session;
    members: SessionMember[];
    boundary: BoundarySnapshot;
    episodes: Episode[];
  }> {
    const sRes = await pool.query(
      `SELECT id, room_code as "roomCode", show_id as "showId", host_id as "hostId",
              status, boundary_episode_id as "boundaryEpisodeId", boundary_version as "boundaryVersion",
              invitation_token_hash as "invitationTokenHash", expires_at as "expiresAt",
              created_at as "createdAt"
       FROM sessions
       WHERE id = $1`,
      [sessionId]
    );

    const session = sRes.rows[0];
    if (!session) {
      throw new Error('Session not found');
    }

    const [members, episodes] = await Promise.all([
      this.getSessionMembers(sessionId),
      this.getEpisodesForShow(session.showId),
    ]);

    const boundary = calculateAuthoritativeBoundary(episodes, members, {
      previousVersion: session.boundaryVersion,
    });

    return { session, members, boundary, episodes };
  }

  async removeMember(
    sessionId: string,
    memberId: string
  ): Promise<{ boundary: BoundarySnapshot }> {
    return await withTransaction(async (client) => {
      await client.query(
        `UPDATE session_members SET status = 'left' WHERE id = $1 AND session_id = $2`,
        [memberId, sessionId]
      );

      const sRes = await client.query(
        `SELECT show_id as "showId", boundary_version as "boundaryVersion" FROM sessions WHERE id = $1`,
        [sessionId]
      );
      const session = sRes.rows[0];
      const episodes = await this.getEpisodesForShow(session.showId);

      const allMembersRes = await client.query<any>(
        `SELECT id, session_id as "sessionId", anonymous_identity as "anonymousIdentity",
                display_name as "displayName", last_watched_episode_id as "lastWatchedEpisodeId",
                role, status, joined_at as "joinedAt", last_seen_at as "lastSeenAt"
         FROM session_members
         WHERE session_id = $1`,
        [sessionId]
      );

      const nextVersion = Number(session.boundaryVersion) + 1;
      const boundary = calculateAuthoritativeBoundary(episodes, allMembersRes.rows, {
        previousVersion: nextVersion,
      });

      await client.query(
        `UPDATE sessions SET boundary_episode_id = $1, boundary_version = $2 WHERE id = $3`,
        [boundary.boundaryEpisodeId, boundary.boundaryVersion, sessionId]
      );

      return { boundary };
    });
  }

  async startSession(sessionId: string): Promise<void> {
    await pool.query(`UPDATE sessions SET status = 'active' WHERE id = $1`, [sessionId]);
  }

  async endSession(sessionId: string): Promise<void> {
    await pool.query(`UPDATE sessions SET status = 'ended' WHERE id = $1`, [sessionId]);
  }
}

export const sessionService = new SessionService();
