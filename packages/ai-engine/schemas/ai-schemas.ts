import { z } from 'zod';

export const AcceptanceCriterionSchema = z.object({
  criteriaCode: z.string().min(1),
  statement: z.string().min(1),
  isTestable: z.boolean().default(true),
});

export const BusinessRuleSchema = z.object({
  ruleCode: z.string().min(1),
  statement: z.string().min(1),
  severity: z.enum(['Mandatory', 'Recommended', 'Advisory']).default('Mandatory'),
});

export const AnalyzedRequirementSchema = z.object({
  reqCode: z.string().regex(/^REQ-\d{3,}$/, 'Must match REQ-001 format'),
  title: z.string().min(2),
  description: z.string().min(5),
  category: z.enum(['Functional', 'Non-Functional']).default('Functional'),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  actors: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).default([]),
  businessRules: z.array(BusinessRuleSchema).default([]),
  missingInformation: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

export const RequirementAnalysisSchema = z.object({
  summary: z.string().min(5),
  actors: z.array(z.string()).default([]),
  workflows: z.array(z.string()).default([]),
  requirements: z.array(AnalyzedRequirementSchema).min(1),
  duplicateWarnings: z.array(z.string()).default([]),
  globalMissingInformation: z.array(z.string()).default([]),
  globalAmbiguities: z.array(z.string()).default([]),
  globalAssumptions: z.array(z.string()).default([]),
});

export type RequirementAnalysis = z.infer<typeof RequirementAnalysisSchema>;
export type AnalyzedRequirement = z.infer<typeof AnalyzedRequirementSchema>;

export const TestTypeEnum = z.enum([
  'Positive',
  'Negative',
  'Boundary',
  'Equivalence',
  'Authentication',
  'Authorization',
  'Validation',
  'Integration',
  'Regression',
  'Security',
]);

export const TestScenarioItemSchema = z.object({
  testCaseId: z.string().regex(/^TC-\d{3,}$/, 'Must match TC-001 format'),
  requirementIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(3),
  testType: TestTypeEnum,
  priority: z.enum(['High', 'Medium', 'Low']),
  preconditions: z.array(z.string()).default([]),
  testSteps: z.array(z.string()).min(1),
  testData: z.record(z.string(), z.unknown()).default({}),
  expectedResult: z.string().min(3),
  tags: z.array(z.string()).default([]),
  reasoning: z.string().min(3),
});

export const TestPlanOutputSchema = z.object({
  scenarios: z.array(TestScenarioItemSchema).min(1),
});

export type TestScenarioItem = z.infer<typeof TestScenarioItemSchema>;

export const AutomationFileSchema = z.object({
  relativePath: z.string().min(3),
  fileCategory: z.enum(['PAGE_OBJECT', 'FIXTURE', 'TEST_SPEC', 'TEST_DATA', 'HELPER']),
  content: z.string().min(10),
  locators: z.array(z.string()).default([]),
  linkedReqIds: z.array(z.string()).default([]),
});

export const GeneratedAutomationOutputSchema = z.object({
  files: z.array(AutomationFileSchema).min(1),
  architectureNotes: z.string().default(''),
});

export type GeneratedAutomationOutput = z.infer<typeof GeneratedAutomationOutputSchema>;
export type GeneratedAutomationFile = z.infer<typeof AutomationFileSchema>;

export const FailureAnalysisSchema = z.object({
  overallSummary: z.string().min(5),
  criticalFailures: z.array(z.string()).default([]),
  potentialRootCauses: z.array(z.string()).default([]),
  failedWorkflows: z.array(z.string()).default([]),
  missingCoverage: z.array(z.string()).default([]),
  recommendedAdditionalTests: z.array(z.string()).default([]),
  suggestedRegressionSuite: z.array(z.string()).default([]),
});

export type FailureAnalysis = z.infer<typeof FailureAnalysisSchema>;
