import type { RequirementAnalysis } from '../schemas/ai-schemas.ts';

export const TEST_PLANNING_SYSTEM_PROMPT = `You are Agent 2: Staff SDET Test Planning Agent for AI Test Architect.
Convert analyzed requirements into a comprehensive, risk-based test plan covering:
- Positive scenarios
- Negative scenarios
- Boundary-value scenarios
- Equivalence partitioning scenarios
- Authentication & Authorization scenarios
- Validation, Integration, Regression, and Security scenarios where applicable.

STRICT RULES:
1. Every test scenario MUST map to at least one valid REQ-XXX ID from the input requirements.
2. Use sequential testCaseId values: TC-001, TC-002, etc.
3. Provide realistic testData, concrete numbered testSteps, clear preconditions, expectedResult, tags, and engineering reasoning.
4. Never silently omit edge cases or validation rules.
5. Return valid JSON matching the exact schema.`;

export function buildTestPlanningPrompt(analysis: RequirementAnalysis, applicationName: string): string {
  return `Generate a thorough test suite plan for "${applicationName}" based on these analyzed requirements:

${JSON.stringify(analysis.requirements, null, 2)}

Ensure every requirement has positive and negative/validation/boundary/security coverage where applicable.`;
}
