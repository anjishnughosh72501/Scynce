import { pool } from '../db/client.js';
import {
  ExtensionLinking,
  DetectedStreamingContext,
  ExtensionCommand,
  ExtensionDeviceState,
  StreamingProviderId,
  ResponseDestination,
} from '@scenesync/shared-types';
import { nanoid } from 'nanoid';
import { realTimeBus } from '../ws/socket.js';

export class ExtensionService {
  async linkExtension(params: {
    installationId: string;
    ownerId: string;
    sessionId?: string | null;
    providerId?: StreamingProviderId | null;
  }): Promise<ExtensionLinking> {
    const { installationId, ownerId, sessionId = null, providerId = null } = params;

    // Verify session if provided
    if (sessionId) {
      const sessRes = await pool.query(`SELECT id, status FROM sessions WHERE id = $1`, [
        sessionId,
      ]);
      if (sessRes.rows.length === 0) {
        throw new Error(`Watch party session ${sessionId} not found`);
      }
      if (sessRes.rows[0].status === 'ended') {
        throw new Error(`Watch party session ${sessionId} has already ended`);
      }
    }

    const id = `ext_${nanoid(12)}`;

    const res = await pool.query<any>(
      `INSERT INTO extension_linkings (
        id, installation_id, owner_id, session_id, provider_id, connection_status, last_seen_at
       ) VALUES ($1, $2, $3, $4, $5, 'connected', CURRENT_TIMESTAMP)
       ON CONFLICT (installation_id) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           session_id = COALESCE(EXCLUDED.session_id, extension_linkings.session_id),
           provider_id = COALESCE(EXCLUDED.provider_id, extension_linkings.provider_id),
           connection_status = 'connected',
           revoked_at = NULL,
           last_seen_at = CURRENT_TIMESTAMP
       RETURNING id, installation_id as "installationId", owner_id as "ownerId",
                 session_id as "sessionId", provider_id as "providerId",
                 detected_content_context as "detectedContentContext",
                 confirmed_content_context as "confirmedContentContext",
                 connection_status as "connectionStatus",
                 display_destination as "displayDestination",
                 last_seen_at as "lastSeenAt", revoked_at as "revokedAt",
                 created_at as "createdAt"`,
      [id, installationId, ownerId, sessionId, providerId]
    );

    const linking = res.rows[0] as ExtensionLinking;

    if (linking.sessionId) {
      const devState: ExtensionDeviceState = {
        installationId: linking.installationId,
        providerId: linking.providerId,
        connectionStatus: 'connected',
        detectedContext: linking.detectedContentContext,
        confirmedContext: linking.confirmedContentContext,
        displayDestination: linking.displayDestination,
        lastSeenAt: linking.lastSeenAt,
      };
      realTimeBus.extensionConnected(linking.sessionId, devState);
    }

    return linking;
  }

  async revokeExtension(installationId: string): Promise<void> {
    const res = await pool.query<any>(
      `UPDATE extension_linkings
       SET connection_status = 'revoked', revoked_at = CURRENT_TIMESTAMP
       WHERE installation_id = $1
       RETURNING session_id as "sessionId"`,
      [installationId]
    );

    if (res.rowCount && res.rowCount > 0 && res.rows[0]?.sessionId) {
      realTimeBus.extensionDisconnected(res.rows[0].sessionId, installationId);
    }
  }

  async updateContext(
    installationId: string,
    context: DetectedStreamingContext,
    isConfirmed: boolean = false
  ): Promise<ExtensionLinking> {
    const checkRes = await pool.query(
      `SELECT connection_status as "connectionStatus", session_id as "sessionId"
       FROM extension_linkings WHERE installation_id = $1`,
      [installationId]
    );

    if (checkRes.rows.length === 0) {
      throw new Error(`Extension ${installationId} is not linked`);
    }

    if (checkRes.rows[0].connectionStatus === 'revoked') {
      throw new Error(`Extension ${installationId} has been revoked`);
    }

    const sessionId = checkRes.rows[0].sessionId;

    const res = await pool.query<any>(
      `UPDATE extension_linkings
       SET provider_id = $1,
           detected_content_context = $2,
           confirmed_content_context = CASE WHEN $3 THEN $2 ELSE confirmed_content_context END,
           last_seen_at = CURRENT_TIMESTAMP
       WHERE installation_id = $4
       RETURNING id, installation_id as "installationId", owner_id as "ownerId",
                 session_id as "sessionId", provider_id as "providerId",
                 detected_content_context as "detectedContentContext",
                 confirmed_content_context as "confirmedContentContext",
                 connection_status as "connectionStatus",
                 display_destination as "displayDestination",
                 last_seen_at as "lastSeenAt", revoked_at as "revokedAt",
                 created_at as "createdAt"`,
      [context.providerId, JSON.stringify(context), isConfirmed, installationId]
    );

    const updated = res.rows[0] as ExtensionLinking;

    if (sessionId) {
      if (isConfirmed) {
        realTimeBus.extensionContextConfirmed(sessionId, installationId, context);
      } else {
        realTimeBus.extensionContextDetected(sessionId, installationId, context);
      }
    }

    return updated;
  }

  async getExtensionState(installationId: string): Promise<ExtensionLinking | null> {
    const res = await pool.query<any>(
      `SELECT id, installation_id as "installationId", owner_id as "ownerId",
              session_id as "sessionId", provider_id as "providerId",
              detected_content_context as "detectedContentContext",
              confirmed_content_context as "confirmedContentContext",
              connection_status as "connectionStatus",
              display_destination as "displayDestination",
              last_seen_at as "lastSeenAt", revoked_at as "revokedAt",
              created_at as "createdAt"
       FROM extension_linkings
       WHERE installation_id = $1`,
      [installationId]
    );

    return res.rows[0] || null;
  }

  async getSessionExtensions(sessionId: string): Promise<ExtensionDeviceState[]> {
    const res = await pool.query<any>(
      `SELECT installation_id as "installationId", provider_id as "providerId",
              connection_status as "connectionStatus",
              detected_content_context as "detectedContext",
              confirmed_content_context as "confirmedContext",
              display_destination as "displayDestination",
              last_seen_at as "lastSeenAt"
       FROM extension_linkings
       WHERE session_id = $1 AND connection_status != 'revoked'
       ORDER BY last_seen_at DESC`,
      [sessionId]
    );

    return res.rows;
  }

  async dispatchCommand(
    sessionId: string,
    command: { type: any; payload?: any },
    issuedBy: string
  ): Promise<ExtensionCommand> {
    const cmd: ExtensionCommand = {
      commandId: `cmd_${nanoid(12)}`,
      type: command.type,
      payload: command.payload || {},
      issuedBy,
      issuedAt: new Date().toISOString(),
    };

    realTimeBus.extensionCommandDispatched(sessionId, cmd);
    return cmd;
  }
}

export const extensionService = new ExtensionService();
