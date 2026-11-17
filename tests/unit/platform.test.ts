import { describe, expect, it } from 'vitest';
import {
  parseRequirementFileBuffer,
  validatePastedRequirementText,
  validateRequirementUploadMeta,
} from '../../packages/requirement-engine/parser.ts';
import {
  RequirementAnalysisSchema,
  TestScenarioItemSchema,
} from '../../packages/ai-engine/schemas/ai-schemas.ts';
import { createAIProvider } from '../../packages/ai-engine/providers/provider-factory.ts';
import {
  resolveSafeWorkspacePath,
  validateTargetUrl,
} from '../../packages/security/url-guard.ts';
import {
  calculateCoverageAndTraceability,
  exportTraceabilityCsv,
} from '../../packages/coverage-engine/coverage.ts';
import { validateGeneratedAutomation } from '../../packages/test-generator/validator.ts';

describe('Requirement Engine & File Validation', () => {
  it('accepts valid markdown requirement uploads and extracts text', async () => {
    const content = '# Login Spec\nCustomers must log in with valid email and password.';
    const parsed = await parseRequirementFileBuffer('login.md', Buffer.from(content, 'utf8'));
    expect(parsed.fileType).toBe('MD');
    expect(parsed.rawText).toContain('Customers must log in');
  });

  it('rejects unsupported executable extensions and oversized files', () => {
    expect(validateRequirementUploadMeta('malware.exe', 500).valid).toBe(false);
    expect(validateRequirementUploadMeta('huge.md', 5 * 1024 * 1024).valid).toBe(false);
  });

  it('validates minimum pasted text length', () => {
    expect(() => validatePastedRequirementText('short')).toThrow();
    expect(validatePastedRequirementText('Customer must submit FNOL claim with valid policy.')).toContain('FNOL');
  });
});

describe('AI Schemas & Provider Factory', () => {
  it('selects MockAIProvider when explicitly requested', () => {
    const provider = createAIProvider('mock');
    expect(provider.providerName).toBe('mock');
    expect(provider.modelName).toBe('deterministic-mock-v1');
  });

  it('validates requirement analysis and test scenario Zod schemas', () => {
    const reqParsed = RequirementAnalysisSchema.parse({
      summary: 'Valid summary of login requirements',
      requirements: [
        {
          reqCode: 'REQ-001',
          title: 'Customer Login',
          description: 'Customer authenticates using email and password.',
          category: 'Functional',
          priority: 'High',
        },
      ],
    });
    expect(reqParsed.requirements).toHaveLength(1);

    const tcParsed = TestScenarioItemSchema.parse({
      testCaseId: 'TC-001',
      requirementIds: ['REQ-001'],
      title: 'Valid customer login succeeds',
      testType: 'Positive',
      priority: 'High',
      testSteps: ['Enter email', 'Enter password', 'Click Sign In'],
      expectedResult: 'User enters customer portal',
      reasoning: 'Core positive login path',
    });
    expect(tcParsed.testCaseId).toBe('TC-001');
  });
});

describe('Security Guardrails & Static Validation Agent', () => {
  it('blocks SSRF metadata endpoints and file:// URLs while allowing localhost', () => {
    expect(validateTargetUrl('http://127.0.0.1:3000/demo-insurance').valid).toBe(true);
    expect(validateTargetUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
    expect(validateTargetUrl('file:///etc/passwd').valid).toBe(false);
  });

  it('blocks path traversal outside automation workspace', () => {
    expect(() => resolveSafeWorkspacePath('/tmp/ws', '../../etc/passwd')).toThrow();
    expect(resolveSafeWorkspacePath('/tmp/ws', 'pages/LoginPage.ts')).toBe('/tmp/ws/pages/LoginPage.ts');
  });

  it('flags unsafe eval() or missing expect() in generated automation', () => {
    const report = validateGeneratedAutomation(
      [
        {
          relativePath: 'tests/bad.spec.ts',
          fileCategory: 'TEST_SPEC',
          content: "import { test } from '@playwright/test'; test('bad', async () => { eval('1+1'); });",
          locators: [],
          linkedReqIds: ['REQ-001'],
        },
      ],
      ['REQ-001']
    );
    expect(report.passed).toBe(false);
    expect(report.errorCount).toBeGreaterThanOrEqual(2);
  });
});

describe('Coverage Engine & Traceability Matrix', () => {
  it('calculates requirement coverage, uncovered requirements, orphans, and CSV output', () => {
    const audit = calculateCoverageAndTraceability({
      requirements: [
        {
          id: 'r1',
          reqCode: 'REQ-001',
          title: 'Login',
          priority: 'High',
          acceptanceCriteria: [{ criteriaCode: 'AC-001', statement: 'Login works' }],
          businessRules: [{ ruleCode: 'BR-001', statement: 'Password required' }],
        },
        {
          id: 'r2',
          reqCode: 'REQ-002',
          title: 'Audit Trail',
          priority: 'Medium',
          acceptanceCriteria: [],
          businessRules: [],
        },
      ],
      scenarios: [
        {
          id: 's1',
          testCaseId: 'TC-001',
          requirementIds: ['REQ-001'],
          title: 'Valid login',
          testType: 'Positive',
          priority: 'High',
          status: 'AUTOMATED',
        },
        {
          id: 's2',
          testCaseId: 'TC-099',
          requirementIds: ['REQ-999'],
          title: 'Orphan test',
          testType: 'Negative',
          priority: 'Low',
          status: 'DRAFT',
        },
      ],
      latestResults: [{ testCaseId: 'TC-001', specFile: 'tests/auth.spec.ts', status: 'PASSED' }],
    });

    expect(audit.totalRequirements).toBe(2);
    expect(audit.coveredRequirements).toBe(1);
    expect(audit.coveragePercentage).toBe(50);
    expect(audit.uncoveredReqCodes).toEqual(['REQ-002']);
    expect(audit.orphanScenarioIds).toEqual(['TC-099']);
    expect(audit.reqsMissingNegativeTests).toEqual(['REQ-001']);

    const csv = exportTraceabilityCsv(audit.matrix);
    expect(csv).toContain('REQ-001');
    expect(csv).toContain('PASSED');
    expect(csv).toContain('UNCOVERED');
  });
});
