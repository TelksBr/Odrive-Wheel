import { describe, expect, test } from 'bun:test';
import { connectionPhase, connectionStatusMessageKey, connectionStatusTone } from './connectionStatus';

describe('connectionPhase', () => {
  test('live wins over reconnecting and connecting', () => {
    expect(connectionPhase({ connected: true, connecting: true, reconnecting: true })).toBe('live');
    expect(connectionStatusMessageKey('live')).toBe('connected');
    expect(connectionStatusTone('live')).toBe('ok');
  });

  test('connecting beats reconnecting when not live', () => {
    expect(connectionPhase({ connected: false, connecting: true, reconnecting: true })).toBe('connecting');
  });

  test('reconnecting is exclusive of connected', () => {
    expect(connectionPhase({ connected: false, connecting: false, reconnecting: true })).toBe('reconnecting');
    expect(connectionStatusMessageKey('reconnecting')).toBe('reconnectingEllipsis');
    expect(connectionStatusTone('reconnecting')).toBe('warn');
  });

  test('idle when all flags are off', () => {
    expect(connectionPhase({ connected: false, reconnecting: false })).toBe('idle');
    expect(connectionStatusMessageKey('idle')).toBe('disconnected');
  });
});
