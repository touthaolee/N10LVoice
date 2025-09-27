# HTML Scenario Unification Plan

This document outlines the steps to consolidate the five scenario-specific pages (`PersonalCare.html`, `VitalSigns.html`, `VitalSignsWeek2.html`, `MedicationScenarioWeek3.html`, `PhysicalAssessmentWeek5.html`) into a single reusable template with data-driven configuration.

## Inventory Summary
- **Common structure**: `<head>` metadata, toolbar buttons, speech controls, checklist sections, evaluation footer, Socket.IO wiring, offline tracker, speech-to-text integration.
- **Scenario-specific elements**: title, intro text, color accents occasionally hard-coded in inline styles, checklist contents (sections/items), guided practice prompts, resource links.

## Unification Objectives
1. **Single template** for layout, styles, and shared scripts.
2. **Scenario data modules** defining titles, descriptive text, checklist items, and guided steps.
3. **Dynamic loader** that selects scenario data via query param or route and renders DOM accordingly.
4. (Optional) **Build tool** to pre-generate static HTML for legacy URLs until routing is adjusted.

## Proposed Refactor Steps

### 1. Create Base Template
- File: `src/client/templates/scenario-base.html` (or rename existing `PersonalCare.html` once stripped).
- Responsibilities: include `<head>` metadata, link to shared CSS/JS, render placeholders (`<div id="scenario-title"></div>`, `<section id="checklist"></section>`, etc.).
- Move global styles to `src/client/css/scenario.css` and load via `<link>`.

### 2. Extract Shared Scripts
- Consolidate inline JS (speech setup, checklist toggles, Socket.IO handlers) into `src/client/js/scenario.js`.
- Export functions that accept scenario configuration (e.g., `initScenario(scenarioConfig)`).

### 3. Define Scenario Data
- Directory: `src/client/scenarios/`
  - `personal-care.js`
  - `vital-signs-week2.js`
  - `medication-week3.js`
  - `gtube-week4.js`
  - `physical-assessment-week5.js`
- Each module exports an object:
  ```js
  export default {
    id: 'personal-care',
    title: 'NURS 10L - Personal Care Peer Evaluation',
    description: 'Shannon Shaw Case Study...',
    checklistSections: [
      { title: 'Preparation', items: [ ... ] },
      ...
    ],
    guidedSteps: [...],
    resources: [...]
  };
  ```

### 4. Build Scenario Loader
- New file: `src/client/js/scenario-loader.js`.
- Reads query param (`?scenario=`) or hash to select module.
- Uses dynamic imports: `import('./scenarios/${scenarioId}.js')`.
- Calls `initScenario(config)` from shared script to render UI.
- Handles missing scenario with fallback message.

### 5. Update Entry Point(s)
- Create `scenario.html` that loads the base template and loader script.
- Optional: keep old filenames (`PersonalCare.html`, etc.) temporarily as HTML stubs that redirect to `scenario.html?scenario=personal-care`.

### 6. Testing & Verification
- Verify each scenario renders correctly via new entry point.
- Test speech features, checklist toggles, evaluation submission per scenario.
- Run `npm start` (via Docker) and validate `/PersonalCare.html` redirect or new route.

### 7. Deployment Considerations
- Update navigation links in `index.html`, admin dashboards, and documentation to use the unified route.
- Ensure Docker image copies new CSS/JS bundles.
- Communicate new structure to the team.

## Migration Timeline
1. Extract template & shared resources.
2. Build scenario data modules iteratively (migrate one scenario, verify, repeat).
3. Introduce loader & new entry point.
4. Remove redundant HTML once confident.

## Risks & Mitigations
- **Risk**: Missing scenario nuances during extraction. Mitigate by migrating one page at a time and diffing output.
- **Risk**: Speech/Socket logic assumes specific DOM IDs. Mitigate by keeping IDs consistent or refactoring scripts to be configuration-driven.
- **Risk**: Legacy links to old HTML pages. Mitigate via redirect stubs or server-side routes.

## Next Actions
- Approve plan.
- Start with extracting shared CSS/JS and creating the first scenario module (e.g., Personal Care) as a proof of concept before completing the full migration.

## Progress Checklist
- [x] Extract shared layout/styles/scripts into reusable assets (`scenario.html`, `css/scenario.css`, `js/scenario.js`, loader scaffold).
- [x] Migrate Personal Care scenario content into data module and verify rendering via the unified template.
- [x] Port Vital Signs Week 2 scenario to the new structure.
- [x] Port Medication Week 3 scenario to the new structure.
- [x] Port G-tube Week 4 scenario to the new structure.
- [x] Port Physical Assessment Week 5 scenario to the new structure.
- [x] Create redirect stubs for legacy scenario HTML files.
- [ ] Update navigation links in `index.html` and admin dashboards to use unified routes.
- [ ] Final testing and verification of all scenarios.

## Recent Completion Summary

✅ **All five scenarios successfully migrated to unified system:**

1. **Personal Care** (`personal-care`) - Complete with setup module and HTML template
2. **Vital Signs Week 2** (`vital-signs-week2`) - Complete with setup module and HTML template  
3. **Medication Week 3** (`medication-week3`) - Complete with setup module and HTML template
4. **G-tube Week 4** (`gtube-week4`) - Complete with setup module and HTML template
5. **Physical Assessment Week 5** (`physical-assessment-week5`) - Complete with setup module and HTML template

✅ **Infrastructure completed:**
- Scenario loader with dynamic imports (`scenario-loader.js`)
- Base template with shared layout (`scenario.html`)
- Shared CSS and utilities (`css/scenario.css`)
- Registry system for scenario management
- Redirect stubs for legacy URL compatibility

✅ **Features preserved:**
- Speech-to-text integration for all scenarios
- Checklist scoring and progress tracking
- Evaluation submission and persistence
- Section toggle functionality
- Auto-save progress capabilities
