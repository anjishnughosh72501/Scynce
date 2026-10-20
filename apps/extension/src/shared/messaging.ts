import {
  DetectedStreamingContext,
  ExtensionCommand,
  BoundarySnapshot,
  Recap,
  QuestionAnswer,
} from '@scenesync/shared-types';

export type ExtensionInternalMessage =
  | { type: 'PAGE_CONTEXT_DETECTED'; payload: DetectedStreamingContext }
  | { type: 'CONFIRM_CONTENT_CONTEXT'; payload: DetectedStreamingContext }
  | { type: 'CONNECT_TO_SESSION'; payload: { sessionId?: string; roomCode?: string } }
  | { type: 'DISCONNECT_FROM_SESSION' }
  | { type: 'GET_EXTENSION_STATE' }
  | { type: 'SUBMIT_QUESTION'; payload: { question: string; destination?: string } }
  | { type: 'EXECUTE_REMOTE_COMMAND'; payload: ExtensionCommand }
  | { type: 'UPDATE_BOUNDARY'; payload: BoundarySnapshot }
  | { type: 'RECAP_UPDATED'; payload: Recap }
  | { type: 'ANSWER_RECEIVED'; payload: QuestionAnswer }
  | { type: 'TOGGLE_OVERLAY'; payload: { enabled: boolean } };

export function sendRuntimeMessage(message: ExtensionInternalMessage): Promise<any> {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }
  return Promise.resolve({ success: false, error: 'chrome.runtime not available' });
}
