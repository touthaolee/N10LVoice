# Health Endpoint Monitoring Guide

The `/api/health` endpoint now exposes diagnostics for database startup retries and live test session recovery. Use this guide to add basic monitoring or local smoke tests.

## Response Overview

Example snippet:

```json
{
  "ok": true,
  "uptimeSeconds": 124,
  "liveTestSessionActive": false,
  "connectedAdmins": 1,
  "connectedStudents": 3,
  "diagnostics": {
    "db": {
      "attempts": 2,
      "lastAttempt": "2024-06-18T18:42:10.123Z",
      "lastSuccess": "2024-06-18T18:42:12.456Z",
      "lastFailure": "2024-06-18T18:42:05.789Z",
      "lastError": "connect ECONNREFUSED",
      "lastRetryDelayMs": 4000
    },
    "sessionRecovery": {
      "lastChecked": "2024-06-18T18:42:12.789Z",
      "lastAction": "restored",
      "restoredSessionUuid": "2a07ce3e-8f9f-4da5-a312-4e86f5da4bf6",
      "autoEndedSessionUuid": null,
      "autoEndedReason": null,
      "autoEndedAt": null
    }
  }
}
```

Key fields to alert on:

- `diagnostics.db.lastFailure` – recent DB init failure timestamps.
- `diagnostics.db.lastError` – captured error message for the last failure.
- `diagnostics.sessionRecovery.lastAction` – `auto-ended` indicates the server cleaned up a stale session automatically.
- `liveTestSessionActive` – boolean flag to watch for unexpected long-running sessions.

## Local Smoke Check

Run the bundled script against a running server instance:

```bash
node scripts/check_health_endpoint.js
```

Override the URL when testing remote or containerized environments:

```bash
node scripts/check_health_endpoint.js http://localhost:8080/api/health
```

The script verifies the response shape and prints a concise JSON summary so CI/CD jobs can parse the output.

## Integrating With Monitoring

1. **HTTP Polling** – Register the endpoint with tools such as UptimeRobot, Datadog Synthetic checks, or Grafana Cloud. Ensure they expect `200 OK` and parse the JSON body for diagnostics fields.
2. **Prometheus Exporter** – If you use Prometheus, adapt the script to emit metrics (e.g., using `prom-client`) and expose them via a sidecar.
3. **Alert Rules** – Trigger alerts when:
   - `diagnostics.db.attempts` suddenly spikes compared to the baseline.
   - `diagnostics.sessionRecovery.lastAction` equals `error` or `auto-ended` repeatedly within a short window.
   - `uptimeSeconds` resets unexpectedly, signaling unplanned restarts.

## Next Steps

- Add the smoke script to your deployment pipeline to validate each release (`node scripts/check_health_endpoint.js`).
- Extend the health endpoint by attaching build metadata (git SHA, release tags) if you need finer-grained observability.
- Consider persisting diagnostics snapshots using your existing logging/metrics stack to correlate with incident timelines.
