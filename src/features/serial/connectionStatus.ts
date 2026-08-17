export type ConnectionPhase = 'idle' | 'connecting' | 'live' | 'reconnecting';

export function connectionPhase(state: {
  connected: boolean;
  connecting?: boolean;
  reconnecting: boolean;
}): ConnectionPhase {
  if (state.connected) {
    return 'live';
  }
  if (state.connecting) {
    return 'connecting';
  }
  if (state.reconnecting) {
    return 'reconnecting';
  }
  return 'idle';
}

export function connectionStatusMessageKey(phase: ConnectionPhase): string {
  switch (phase) {
    case 'live':
      return 'connected';
    case 'connecting':
      return 'serialConnecting';
    case 'reconnecting':
      return 'reconnectingEllipsis';
    default:
      return 'disconnected';
  }
}

export function connectionStatusTone(phase: ConnectionPhase): 'ok' | 'warn' | 'neutral' {
  switch (phase) {
    case 'live':
      return 'ok';
    case 'connecting':
    case 'reconnecting':
      return 'warn';
    default:
      return 'neutral';
  }
}
