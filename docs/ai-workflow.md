# Multi-Agent AI Workflow

AI Test Architect coordinates six specialized engineering agents:

1. **Agent 1: Requirement Analyst (`RequirementAnalystAgent`)**
   - Extracts functional and non-functional requirements (`REQ-001`, ...), actors, acceptance criteria (`AC-001`, ...), and business rules (`BR-001`, ...).
   - Flags missing information, ambiguities, assumptions, and duplicates without inventing requirements.
2. **Agent 2: Test Planning Agent (`TestPlanningAgent`)**
   - Generates structured Positive, Negative, Boundary, Validation, Authorization, and Security scenarios (`TC-001`, ...) validated against `TestPlanOutputSchema`.
3. **Agent 3: Application Explorer Agent (`explorer.ts`)**
   - Launches headless Chromium against the approved application origin, discovers accessible roles/labels/testIds, and records DOM summaries + screenshots.
4. **Agent 4: Playwright Code Generator (`PlaywrightCodeGeneratorAgent`)**
   - Produces strict TypeScript Page Objects, Playwright fixtures, JSON test data, and `.spec.ts` files mapped to `REQ-XXX` and `TC-XXX` IDs.
5. **Agent 5: Test Validation Agent (`validator.ts`)**
   - Performs static TypeScript syntax checking, path allowlist verification, security pattern blocking, assertion verification, and requirement mapping checks before human Code Review.
6. **Agent 6: Test Coverage & Executive Analyst (`coverage.ts`, `executive-report.ts`)**
   - Computes deterministic requirement coverage (distinct from code coverage), builds the Traceability Matrix, and synthesizes real execution artifacts into an Executive QA Summary.
