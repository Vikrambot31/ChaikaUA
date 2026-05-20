/**
 * Session ID Service
 * Generates a single unique session ID per app launch.
 * Shared across runtimeMonitorService and liveDiagnosticsService
 * so all logs from the same session are correlatable in admin panel.
 */
const SESSION_ID = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const getSessionId = (): string => SESSION_ID;
