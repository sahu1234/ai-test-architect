# System Architecture

## High-Level Component Breakdown

1. **Web Platform (`src/`, `apps/web/api/`)**:
   - React 19 + Tailwind CSS v4 enterprise dashboard.
   - Express API server (`server.ts`) managing project lifecycles, file parsing, AI orchestration, Playwright browser orchestration, and static report serving.
2. **AI Engine (`packages/ai-engine/`)**:
   - `AIProvider` interface abstracting `GeminiProvider` (`@google/genai` SDK) and `MockAIProvider` (deterministic offline demo engine).
   - Version-controlled prompts (`prompts/*.ts`), strict Zod schemas (`schemas/ai-schemas.ts`), and execution logging (`orchestrator/ai-orchestrator.ts`).
3. **Requirement Engine (`packages/requirement-engine/`)**:
   - Validates file types (`.txt`, `.md`, `.markdown`, `.pdf`, `.docx`) and 2 MB upload bounds, extracting clean text via `unpdf` and `mammoth`.
4. **Application Explorer (`packages/application-explorer/`)**:
   - Controlled Playwright browser session inspecting target origins, forms, and accessible DOM locators (`getByTestId`, `getByRole`, `getByLabel`) while capturing full-page screenshots.
5. **Test Generator & Static Validator (`packages/test-generator/`)**:
   - Materializes POMs, fixtures, JSON test data, and `.spec.ts` files inside isolated `generated-tests/<projectId>/<automationId>/` workspaces.
   - Agent 5 validates TypeScript syntax via `typescript` compiler API, scans for forbidden APIs, verifies `expect()` assertions, and checks `REQ-XXX` references.
6. **Playwright Execution & Reporting (`packages/playwright-runner/`, `packages/coverage-engine/`, `packages/reporting/`)**:
   - Runs approved suites via controlled `spawn('npx', ['playwright', 'test', ...], { shell: false })`.
   - Captures HTML, JSON, JUnit XML reports, failure screenshots, traces, and videos.
   - Computes Requirement Coverage and exports CSV/JSON Traceability Matrices.
7. **Isolated Target Demo (`apps/demo-insurance-app/`, `src/demo-insurance/`)**:
   - Veridian P&C Insurance Portal implementing Customer, Adjuster, and Admin portals with deterministic seed data and business rule validations.
