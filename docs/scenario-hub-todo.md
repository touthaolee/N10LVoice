# Scenario Hub TODO

## Foundation
- [ ] Finalize scenario registry format (JSON/JS module) with fields for id, title, subtitle, default times, tags, content path, and optional setup.
- [ ] Update `js/scenario-loader.js` to consume the registry instead of hard-coded entries.
- [ ] Create `scenarios/index.html` hub UI with responsive scenario cards and filters.
- [ ] Build accompanying `scenarios/index.js` to render cards from the registry and handle routing (`Launch`, future `Edit`/`Duplicate`).

## Scenario Migrations
- [x] Personal Care (Week 1) migrated to unified template.
- [x] Vital Signs (legacy `VitalSigns.html`).
- [x] Week 2 Vital Signs Scenario (legacy `VitalSignsWeek2.html`).
- [ ] Medication Scenario Week 3 (legacy `MedicationScenarioWeek3.html`).
- [ ] Physical Assessment Week 5 (legacy `PhysicalAssessmentWeek5.html`).
- [ ] G-tube Week 4 (legacy `GtubeWeek4.html`).

## Legacy Cleanup
- [ ] Replace each legacy HTML with redirect stubs pointing to `scenario.html?scenario=<id>`.
- [ ] Remove duplicated inline styles/scripts once all scenarios are migrated.
- [ ] Update navigation links (home, admin dashboards, docs) to reference the hub or unified URLs.

## Custom Scenario Support (Future)
- [ ] Design simple schema for user-defined scenarios (title, content html/markdown, metadata).
- [ ] Prototype “Create Scenario” flow on the hub (client-side storage or API stub).
- [ ] API endpoint & persistence layer for saving/loading custom scenarios.

## Testing & QA
- [ ] Smoke test each migrated scenario via Docker deployment (check speech, Socket.IO, submission flows).
- [ ] Add automated regression tests or linting for scenario config completeness.
- [ ] Document the migration process and scenario registry maintenance in README.
