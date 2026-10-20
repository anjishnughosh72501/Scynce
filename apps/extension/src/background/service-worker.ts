import { io, Socket } from 'socket.io-client';
import { getStoredState, updateStoredState } from '../shared/storage.js';
import { ExtensionInternalMessage } from '../shared/messaging.js';
import {
  ExtensionCommand,
  DetectedStreamingContext,
} from '@scenesync/shared-types';

let socket: Socket | null = null;

async function initBackground() {
  const state = await getStoredState();

  // Link extension installation with backend
  try {
    const res = await fetch(`${state.apiBaseUrl}/api/extensions/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installationId: state.installationId,
        ownerId: `user_${state.installationId.substring(0, 8)}`,
        sessionId: state.sessionId,
      }),
    });
    if (res.ok) {
      console.log('[SceneSync ServiceWorker] Extension linked successfully');
    }
  } catch (err) {
    console.warn('[SceneSync ServiceWorker] Backend link failed (will retry):', err);
  }

  // Connect Socket.IO if session active
  connectSocket(state.apiBaseUrl, state.sessionId);
}

function connectSocket(baseUrl: string, sessionId: string | null) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(baseUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[SceneSync ServiceWorker] Socket connected');
    if (sessionId) {
      socket?.emit('join-session', sessionId);
    }
  });

  socket.on('extension.boundary.updated', (payload: any) => {
    broadcastInternalMessage({
      type: 'UPDATE_BOUNDARY',
      payload: payload.boundary,
    });
  });

  socket.on('session.boundary_updated', (payload: any) => {
    broadcastInternalMessage({
      type: 'UPDATE_BOUNDARY',
      payload: payload.boundary,
    });
  });

  socket.on('extension.answer.ready', (payload: any) => {
    broadcastInternalMessage({
      type: 'ANSWER_RECEIVED',
      payload: payload.questionAnswer,
    });
  });

  socket.on('answer.ready', (payload: any) => {
    broadcastInternalMessage({
      type: 'ANSWER_RECEIVED',
      payload: payload.questionAnswer,
    });
  });

  socket.on('extension.command.dispatched', async (payload: { sessionId: string; command: ExtensionCommand }) => {
    console.log('[SceneSync ServiceWorker] Remote command received:', payload.command);
    await handleRemoteCommand(payload.command);
  });
}

function broadcastInternalMessage(msg: ExtensionInternalMessage) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage(msg).catch(() => {
      // Side panel or popup may not be currently open; ignore
    });
  }
}

async function handleRemoteCommand(command: ExtensionCommand) {
  const state = await getStoredState();

  switch (command.type) {
    case 'DISCONNECT_EXTENSION':
      await updateStoredState({ sessionId: null });
      if (socket && state.sessionId) {
        socket.emit('leave-session', state.sessionId);
      }
      broadcastInternalMessage({ type: 'DISCONNECT_FROM_SESSION' });
      break;

    case 'SET_CONTENT_CONTEXT':
      if (command.payload?.context) {
        await updateStoredState({
          confirmedContext: command.payload.context,
        });
        broadcastInternalMessage({
          type: 'CONFIRM_CONTENT_CONTEXT',
          payload: command.payload.context,
        });
      }
      break;

    case 'SET_ACTIVE_SESSION':
      if (command.payload?.sessionId) {
        await updateStoredState({ sessionId: command.payload.sessionId });
        connectSocket(state.apiBaseUrl, command.payload.sessionId);
      }
      break;
  }
}

// Extension message listener
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionInternalMessage, _sender, sendResponse) => {
    (async () => {
      const state = await getStoredState();

      switch (message.type) {
        case 'GET_EXTENSION_STATE':
          sendResponse({ success: true, state });
          break;

        case 'PAGE_CONTEXT_DETECTED': {
          await updateStoredState({ detectedContext: message.payload });
          try {
            await fetch(`${state.apiBaseUrl}/api/extensions/${state.installationId}/context`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                context: message.payload,
                isConfirmed: false,
              }),
            });
          } catch {}
          sendResponse({ success: true });
          break;
        }

        case 'CONFIRM_CONTENT_CONTEXT': {
          await updateStoredState({ confirmedContext: message.payload });
          try {
            await fetch(`${state.apiBaseUrl}/api/extensions/${state.installationId}/context`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                context: message.payload,
                isConfirmed: true,
              }),
            });
          } catch {}
          sendResponse({ success: true });
          break;
        }

        case 'CONNECT_TO_SESSION': {
          const { sessionId, roomCode } = message.payload;
          let targetSessionId = sessionId;

          if (!targetSessionId && roomCode) {
            // Join via room code
            try {
              const joinRes = await fetch(`${state.apiBaseUrl}/api/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  roomCode,
                  displayName: `Desktop (${state.detectedContext?.providerId || 'Browser'})`,
                }),
              });
              const joinData = await joinRes.json();
              if (joinData.success) {
                targetSessionId = joinData.session.id;
              }
            } catch (err: any) {
              sendResponse({ success: false, error: err.message });
              return;
            }
          }

          if (targetSessionId) {
            await updateStoredState({ sessionId: targetSessionId });
            await fetch(`${state.apiBaseUrl}/api/extensions/link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                installationId: state.installationId,
                ownerId: `user_${state.installationId.substring(0, 8)}`,
                sessionId: targetSessionId,
                providerId: state.detectedContext?.providerId || null,
              }),
            });
            connectSocket(state.apiBaseUrl, targetSessionId);
            sendResponse({ success: true, sessionId: targetSessionId });
          } else {
            sendResponse({ success: false, error: 'Could not connect to session' });
          }
          break;
        }

        case 'DISCONNECT_FROM_SESSION': {
          if (state.sessionId && socket) {
            socket.emit('leave-session', state.sessionId);
          }
          await updateStoredState({ sessionId: null });
          sendResponse({ success: true });
          break;
        }

        case 'SUBMIT_QUESTION': {
          if (!state.sessionId) {
            sendResponse({ success: false, error: 'No active session' });
            return;
          }
          try {
            const res = await fetch(`${state.apiBaseUrl}/api/sessions/${state.sessionId}/questions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-member-id': `ext_${state.installationId.substring(0, 10)}`,
              },
              body: JSON.stringify({
                question: message.payload.question,
                destination: message.payload.destination || 'all',
                sourceClient: 'extension',
              }),
            });
            const data = await res.json();
            sendResponse(data);
          } catch (err: any) {
            sendResponse({ success: false, error: err.message });
          }
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
          break;
      }
    })();

    return true; // Keep message channel open for async response
  });
}

// Side panel setup for Chrome
if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
}

initBackground();
