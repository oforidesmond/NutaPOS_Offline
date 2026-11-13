/** Offline edition: cloud notification sockets are disabled. */

export function connectNotificationsSocket(): void {
  // no-op
}

export function disconnectNotificationsSocket(): void {
  // no-op
}

export function isNotificationsSocketConnected(): boolean {
  return false;
}

export function reconnectNotificationsSocketWithFreshToken(): void {
  // no-op
}

export function ensureNotificationsSocket(): void {
  // no-op
}
