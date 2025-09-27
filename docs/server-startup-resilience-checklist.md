# Server Startup Resilience Checklist

## Key Gaps
- [x] Restore `global` session metadata (start time, admin info) when recovering an active test session.
- [x] Guard scheduled jobs so they do not run before the database pool is ready.
- [x] Prevent `global.currentTestSession` from being cleared before emitting stop notifications, eliminating related `TypeError` during session stop.
- [x] Introduce a tracked `connectedStudents` collection to avoid `ReferenceError` in admin notifications.

## Resilience Improvements
- [x] Add retry/backoff logic around `initDb()` so server startup tolerates slow or restarting MySQL instances.
- [x] Start session cleanup interval only after the database pool is initialized, or make it a no-op until then.
- [x] Add graceful shutdown handlers to close the HTTP server and MySQL pool cleanly.
- [x] (Optional) Extend health/diagnostics logging to surface startup recovery actions for easier monitoring.
