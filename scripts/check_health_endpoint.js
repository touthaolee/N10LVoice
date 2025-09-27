#!/usr/bin/env node
/**
 * Simple smoke check for the N10L server health endpoint.
 * Usage: node scripts/check_health_endpoint.js [url]
 */

const DEFAULT_URL = 'http://localhost:3001/api/health';
const url = process.argv[2] || DEFAULT_URL;

async function main() {
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      console.error(`Health check failed: ${res.status} ${res.statusText}`);
      process.exitCode = 1;
      return;
    }

    const data = await res.json();
    const requiredFields = ['ok', 'ts', 'diagnostics'];
    const missing = requiredFields.filter((key) => !(key in data));
    if (missing.length) {
      console.error(`Health payload missing fields: ${missing.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    const diagnostics = data.diagnostics || {};
    const dbDiagnostics = diagnostics.db || {};
    const recoveryDiagnostics = diagnostics.sessionRecovery || {};

    const summary = {
      ok: data.ok,
      uptimeSeconds: data.uptimeSeconds,
      liveTestSessionActive: data.liveTestSessionActive,
      connectedAdmins: data.connectedAdmins,
      connectedStudents: data.connectedStudents,
      dbAttempts: dbDiagnostics.attempts,
      dbLastSuccess: dbDiagnostics.lastSuccess,
      sessionRecoveryLastAction: recoveryDiagnostics.lastAction,
      sessionRecoveryTimestamp: recoveryDiagnostics.lastChecked
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(`Health check error: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
