import {
  FailureAnalysisSchema,
  GeneratedAutomationOutputSchema,
  RequirementAnalysisSchema,
  TestPlanOutputSchema,
  type AnalyzedRequirement,
  type FailureAnalysis,
  type GeneratedAutomationOutput,
  type RequirementAnalysis,
  type TestScenarioItem,
} from '../schemas/ai-schemas.ts';
import type {
  AIProvider,
  AutomationInput,
  FailureInput,
  RequirementAnalysisInput,
  TestPlanningInput,
} from './ai-provider.interface.ts';

function extractSectionRequirements(rawText: string): AnalyzedRequirement[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const reqs: AnalyzedRequirement[] = [];
  const headingMatches = lines.filter(
    (l) =>
      /^#{1,3}\s+/.test(l) ||
      /^(REQ|US|FR|STORY)[-_]?\d+/i.test(l) ||
      /^\d+\.\s+[A-Z]/.test(l)
  );

  const lower = rawText.toLowerCase();

  const addReq = (partial: Omit<AnalyzedRequirement, 'reqCode'>) => {
    const code = `REQ-${String(reqs.length + 1).padStart(3, '0')}`;
    reqs.push({ reqCode: code, ...partial });
  };

  if (lower.includes('login') || lower.includes('authentication') || lower.includes('credential')) {
    addReq({
      title: 'Customer & Role-Based Authentication',
      description:
        'Registered users (Customer, Adjuster, Admin) authenticate with email and password to access their authorized portal.',
      category: 'Functional',
      priority: 'High',
      actors: ['Customer', 'Claims Adjuster', 'System Admin'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-001',
          statement: 'Valid credentials authenticate the user and navigate to their role-specific portal.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-002',
          statement: 'Invalid credentials display an explicit authentication error and block portal access.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-003',
          statement: 'Locked or suspended accounts are denied login with a clear account lock message.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-001',
          statement: 'Email and password fields are mandatory before login submission.',
          severity: 'Mandatory',
        },
        {
          ruleCode: 'BR-002',
          statement: 'Role authorization restricts Adjuster and Admin portals from Customer accounts.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: lower.includes('mfa')
        ? []
        : ['Password complexity threshold and MFA policy for adjuster accounts are not specified.'],
      ambiguities: ['Exact number of consecutive failed attempts before account lockout is unspecified.'],
      assumptions: ['Session state persists cleanly across page refresh until explicit sign-out.'],
    });
  }

  if (lower.includes('policy') || lower.includes('policies') || lower.includes('coverage')) {
    addReq({
      title: 'Insurance Policy Portfolio & Coverage Inspection',
      description:
        'Authenticated customers can inspect active and expired insurance policies, coverage limits, deductibles, and policy numbers.',
      category: 'Functional',
      priority: 'High',
      actors: ['Customer'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-004',
          statement: 'Customer portal lists all policies owned by the logged-in policyholder.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-005',
          statement: 'Selecting a policy displays coverage limit, deductible, effective dates, and insured asset details.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-003',
          statement: 'Policy number must conform to format POL-YYYY-XXXX.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: ['Behavior for cancelled vs pending-renewal policies during FNOL is partially unspecified.'],
      ambiguities: [],
      assumptions: ['Policy coverage limits are displayed in USD with two-decimal or whole-dollar formatting.'],
    });
  }

  if (lower.includes('fnol') || lower.includes('first notice of loss') || lower.includes('claim')) {
    addReq({
      title: 'First Notice of Loss (FNOL) Claim Submission',
      description:
        'Customers can submit a new insurance claim against an active policy with incident date, loss type, description, estimated amount, and supporting document metadata.',
      category: 'Functional',
      priority: 'High',
      actors: ['Customer'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-006',
          statement: 'Valid FNOL submission creates a claim in SUBMITTED status and generates a unique claim reference.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-007',
          statement: 'Future incident dates or empty mandatory fields are rejected with inline validation errors.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-008',
          statement: 'Duplicate claim submissions for the same policy and incident date are blocked.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-004',
          statement: 'Incident date cannot be in the future.',
          severity: 'Mandatory',
        },
        {
          ruleCode: 'BR-005',
          statement: 'Supporting claim documents must use allowed extensions (.pdf, .png, .jpg) and stay within size limits.',
          severity: 'Mandatory',
        },
        {
          ruleCode: 'BR-006',
          statement: 'Estimated loss amount must be greater than zero.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: ['Maximum attachment count per claim is not stated.'],
      ambiguities: ['Whether claims on expired policies outside grace period should warn or hard-block is ambiguous.'],
      assumptions: ['Duplicate detection keys on policyNumber + incidentDate + lossType.'],
    });
  }

  if (lower.includes('adjuster') || lower.includes('approve') || lower.includes('reject')) {
    addReq({
      title: 'Adjuster Claim Review, Approval & Rejection',
      description:
        'Claims adjusters review assigned claims, record review notes, and transition claims to APPROVED or REJECTED statuses.',
      category: 'Functional',
      priority: 'High',
      actors: ['Claims Adjuster'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-009',
          statement: 'Adjuster can view claim details and add structured review notes.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-010',
          statement: 'Adjuster can approve or reject a submitted claim, updating status immediately for the customer.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-007',
          statement: 'Rejecting a claim requires a non-empty adjuster justification note.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: [],
      ambiguities: ['Approval payout authority threshold for senior adjusters is not specified.'],
      assumptions: ['Reviewed claims retain audit trail timestamps and adjuster notes.'],
    });
  }

  if (lower.includes('admin') || lower.includes('manage status') || lower.includes('audit')) {
    addReq({
      title: 'Admin User & Claim Governance Portal',
      description:
        'Administrators oversee registered portal users, inspect all claims across policyholders, and override claim statuses when required.',
      category: 'Functional',
      priority: 'Medium',
      actors: ['System Admin'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-011',
          statement: 'Admin portal displays user directory with roles and account statuses.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-012',
          statement: 'Admin can update claim statuses across the global claims ledger.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-008',
          statement: 'Non-admin roles must be denied access to Admin user governance controls.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: ['Audit log retention period is unspecified.'],
      ambiguities: [],
      assumptions: ['Admin status overrides are reflected in real time on customer and adjuster views.'],
    });
  }

  if (reqs.length === 0) {
    const titleBase = headingMatches[0]?.replace(/^#+\s*/, '') || 'Core Application Workflow';
    addReq({
      title: titleBase.slice(0, 80),
      description: lines.slice(0, 3).join(' ').slice(0, 320) || 'Primary user workflow derived from uploaded specification.',
      category: 'Functional',
      priority: 'High',
      actors: ['End User'],
      acceptanceCriteria: [
        {
          criteriaCode: 'AC-001',
          statement: 'User completes primary workflow with valid inputs and receives confirmation.',
          isTestable: true,
        },
        {
          criteriaCode: 'AC-002',
          statement: 'Invalid or missing required inputs show clear validation feedback without crashing.',
          isTestable: true,
        },
      ],
      businessRules: [
        {
          ruleCode: 'BR-001',
          statement: 'Mandatory input fields must be validated prior to submission.',
          severity: 'Mandatory',
        },
      ],
      missingInformation: ['Detailed error message copy and boundary limits should be clarified with product owners.'],
      ambiguities: ['Concurrent update behavior is not explicitly stated in the source text.'],
      assumptions: ['Standard browser session state is used for workflow persistence.'],
    });
  }

  return reqs;
}

export class MockAIProvider implements AIProvider {
  public readonly providerName = 'mock' as const;
  public readonly modelName = 'deterministic-mock-v1';

  async analyzeRequirements(input: RequirementAnalysisInput): Promise<RequirementAnalysis> {
    const requirements = extractSectionRequirements(input.rawText);
    const actors = Array.from(new Set(requirements.flatMap((r) => r.actors)));
    const ambiguities = requirements.flatMap((r) => r.ambiguities);
    const missing = requirements.flatMap((r) => r.missingInformation);
    const assumptions = requirements.flatMap((r) => r.assumptions);

    return RequirementAnalysisSchema.parse({
      summary: `Deterministic Demo Analysis (${this.modelName}) extracted ${requirements.length} structured requirement(s) for ${input.applicationName} from ${input.rawText.length} characters of specification text.`,
      actors: actors.length ? actors : ['End User'],
      workflows: requirements.map((r) => `${r.reqCode}: ${r.title}`),
      requirements,
      duplicateWarnings: [],
      globalMissingInformation: missing.length
        ? missing
        : ['Non-functional SLA targets (p95 response latency) are not explicitly stated.'],
      globalAmbiguities: ambiguities,
      globalAssumptions: assumptions,
    });
  }

  async generateTestScenarios(input: TestPlanningInput): Promise<TestScenarioItem[]> {
    const scenarios: TestScenarioItem[] = [];
    let counter = 1;
    const nextId = () => `TC-${String(counter++).padStart(3, '0')}`;

    for (const req of input.analysis.requirements) {
      const titleLower = req.title.toLowerCase();

      if (titleLower.includes('authentication') || titleLower.includes('login')) {
        scenarios.push(
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Customer login with valid credentials succeeds',
            testType: 'Positive',
            priority: 'High',
            preconditions: ['User is on the Demo Insurance Portal login view', 'Customer account is active'],
            testSteps: [
              'Enter registered customer email "customer@veridian.test"',
              'Enter valid password "CustomerPass!2026"',
              'Click "Sign In"',
            ],
            testData: { email: 'customer@veridian.test', role: 'CUSTOMER' },
            expectedResult: 'Customer portal loads with active policies and FNOL claim submission form.',
            tags: ['smoke', 'auth', 'customer'],
            reasoning: 'Verifies primary positive authentication path for AC-001.',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Login with invalid password displays authentication error',
            testType: 'Negative',
            priority: 'High',
            preconditions: ['User is on the Demo Insurance Portal login view'],
            testSteps: [
              'Enter "customer@veridian.test"',
              'Enter incorrect password "WrongPassword99"',
              'Click "Sign In"',
            ],
            testData: { email: 'customer@veridian.test', password: 'WrongPassword99' },
            expectedResult: 'Error alert indicates invalid credentials and user remains unauthenticated.',
            tags: ['auth', 'negative'],
            reasoning: 'Verifies invalid credential rejection per AC-002.',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Locked customer account is blocked from signing in',
            testType: 'Security',
            priority: 'High',
            preconditions: ['Locked account "locked@veridian.test" exists in seed data'],
            testSteps: [
              'Enter locked account email "locked@veridian.test"',
              'Enter password "LockedPass!2026"',
              'Click "Sign In"',
            ],
            testData: { email: 'locked@veridian.test', status: 'LOCKED' },
            expectedResult: 'Login is rejected with explicit locked-account security message.',
            tags: ['security', 'auth'],
            reasoning: 'Enforces AC-003 account lock control.',
          }
        );
      } else if (titleLower.includes('policy')) {
        scenarios.push(
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Authenticated customer inspects active policy coverage details',
            testType: 'Positive',
            priority: 'High',
            preconditions: ['Authenticated as customer@veridian.test'],
            testSteps: [
              'Navigate to Policies section',
              'Select policy POL-2026-1001',
              'Verify coverage limit, deductible, and status badge',
            ],
            testData: { policyNumber: 'POL-2026-1001' },
            expectedResult: 'Policy coverage details, deductible, and active status are accurately rendered.',
            tags: ['policy', 'smoke'],
            reasoning: 'Validates policy listing and detail inspection (AC-004, AC-005).',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Invalid policy number format is rejected in FNOL policy validation',
            testType: 'Validation',
            priority: 'Medium',
            preconditions: ['Authenticated as customer@veridian.test'],
            testSteps: [
              'Open FNOL claim form',
              'Attempt submission with malformed policy reference or missing selection',
              'Observe validation response',
            ],
            testData: { invalidPolicyNumber: 'BAD-99' },
            expectedResult: 'Validation blocks claim submission until a valid active policy is selected.',
            tags: ['validation', 'policy'],
            reasoning: 'Covers BR-003 policy format enforcement.',
          }
        );
      } else if (titleLower.includes('fnol') || titleLower.includes('claim submission')) {
        scenarios.push(
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Submit valid First Notice of Loss (FNOL) claim with supporting document',
            testType: 'Positive',
            priority: 'High',
            preconditions: ['Authenticated as customer@veridian.test', 'Active policy POL-2026-1001 exists'],
            testSteps: [
              'Select policy POL-2026-1001',
              'Set valid past incident date "2026-10-15"',
              'Select loss type "Water Damage", enter description and estimated amount "4500"',
              'Specify valid document filename "damage-estimate.pdf" and click "Submit Claim"',
            ],
            testData: {
              policyNumber: 'POL-2026-1001',
              incidentDate: '2026-10-15',
              lossType: 'Water Damage',
              estimatedAmount: 4500,
              documentName: 'damage-estimate.pdf',
            },
            expectedResult: 'New claim appears in Customer Claims table with status SUBMITTED.',
            tags: ['fnol', 'smoke', 'e2e'],
            reasoning: 'Tests end-to-end FNOL submission workflow (AC-006).',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Reject FNOL claim with future incident date',
            testType: 'Boundary',
            priority: 'High',
            preconditions: ['Authenticated as customer@veridian.test'],
            testSteps: [
              'Select policy POL-2026-1001',
              'Enter future incident date "2099-01-15"',
              'Fill description and amount "1200"',
              'Click "Submit Claim"',
            ],
            testData: { incidentDate: '2099-01-15' },
            expectedResult: 'Claim submission fails with validation error stating incident date cannot be in the future.',
            tags: ['boundary', 'validation', 'fnol'],
            reasoning: 'Verifies BR-004 temporal boundary rule.',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Block duplicate FNOL claim submission for same policy and incident date',
            testType: 'Negative',
            priority: 'High',
            preconditions: ['Claim already exists for POL-2026-1001 on 2026-09-12'],
            testSteps: [
              'Submit FNOL with policy POL-2026-1001 and existing incident date "2026-09-12" and type "Collision"',
              'Observe duplicate claim protection response',
            ],
            testData: { policyNumber: 'POL-2026-1001', incidentDate: '2026-09-12', lossType: 'Collision' },
            expectedResult: 'System blocks duplicate claim creation and informs user of existing claim.',
            tags: ['negative', 'duplicate-check'],
            reasoning: 'Validates AC-008 duplicate claim prevention.',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Reject unsupported executable document extension during FNOL upload',
            testType: 'Security',
            priority: 'Medium',
            preconditions: ['Authenticated as customer@veridian.test'],
            testSteps: [
              'Fill valid FNOL fields',
              'Enter unsupported document filename "payload.exe"',
              'Click "Submit Claim"',
            ],
            testData: { documentName: 'payload.exe' },
            expectedResult: 'Upload validation rejects disallowed file type.',
            tags: ['security', 'upload'],
            reasoning: 'Enforces BR-005 file-type security boundary.',
          }
        );
      } else if (titleLower.includes('adjuster')) {
        scenarios.push(
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Adjuster reviews submitted claim and approves with review note',
            testType: 'Authorization',
            priority: 'High',
            preconditions: ['Authenticated as adjuster@veridian.test', 'Submitted claim exists'],
            testSteps: [
              'Sign in as Claims Adjuster',
              'Select a SUBMITTED claim from assigned queue',
              'Enter review note "Verified inspection report and coverage limits"',
              'Click "Approve Claim"',
            ],
            testData: { email: 'adjuster@veridian.test', action: 'APPROVED' },
            expectedResult: 'Claim status transitions to APPROVED and review note persists.',
            tags: ['adjuster', 'workflow'],
            reasoning: 'Verifies AC-009 and AC-010 adjuster approval path.',
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: 'Adjuster rejection requires mandatory justification note',
            testType: 'Validation',
            priority: 'Medium',
            preconditions: ['Authenticated as adjuster@veridian.test'],
            testSteps: [
              'Leave review note blank',
              'Click "Reject Claim" on a pending claim',
            ],
            testData: { reviewNote: '' },
            expectedResult: 'Validation error prompts adjuster to supply a rejection justification note.',
            tags: ['validation', 'adjuster'],
            reasoning: 'Enforces BR-007 mandatory rejection reason.',
          }
        );
      } else {
        scenarios.push(
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: `${req.title} — positive execution path`,
            testType: 'Positive',
            priority: req.priority,
            preconditions: ['Target application is accessible'],
            testSteps: [
              'Navigate to target application URL',
              `Execute primary workflow for ${req.reqCode}`,
              'Verify expected confirmation state',
            ],
            testData: { reqCode: req.reqCode },
            expectedResult: req.acceptanceCriteria[0]?.statement || 'Workflow completes cleanly.',
            tags: ['positive'],
            reasoning: `Validates primary acceptance criteria for ${req.reqCode}.`,
          },
          {
            testCaseId: nextId(),
            requirementIds: [req.reqCode],
            title: `${req.title} — negative validation guard`,
            testType: 'Negative',
            priority: 'Medium',
            preconditions: ['Target application is accessible'],
            testSteps: [
              'Navigate to target application URL',
              'Submit invalid or incomplete input',
              'Verify validation feedback',
            ],
            testData: { invalidInput: true },
            expectedResult: 'Application blocks invalid submission and displays clear guidance.',
            tags: ['negative', 'validation'],
            reasoning: `Validates negative/error boundary for ${req.reqCode}.`,
          }
        );
      }
    }

    return TestPlanOutputSchema.parse({ scenarios }).scenarios;
  }

  async generateAutomation(input: AutomationInput): Promise<GeneratedAutomationOutput> {
    const isInsuranceDemo =
      input.targetUrl.includes('/demo-insurance') ||
      input.applicationName.toLowerCase().includes('insurance') ||
      input.scenarios.some((s) =>
        ['login', 'fnol', 'claim', 'policy', 'adjuster'].some((k) =>
          s.title.toLowerCase().includes(k)
        )
      );

    if (isInsuranceDemo) {
      return this.generateInsuranceDemoAutomation(input);
    }

    return this.generateGenericExploredAutomation(input);
  }

  private generateInsuranceDemoAutomation(input: AutomationInput): GeneratedAutomationOutput {
    const targetUrl = input.targetUrl || 'http://127.0.0.1:3000/demo-insurance';
    const allReqIds = Array.from(new Set(input.scenarios.flatMap((s) => s.requirementIds)));

    const loginPageTs = `import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly authErrorBanner: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId('demo-login-email');
    this.passwordInput = page.getByTestId('demo-login-password');
    this.signInButton = page.getByTestId('demo-login-submit');
    this.authErrorBanner = page.getByTestId('demo-auth-error');
    this.signOutButton = page.getByTestId('demo-signout-btn');
  }

  async goto(baseTargetUrl: string) {
    await this.page.goto(baseTargetUrl);
    await this.emailInput.waitFor({ state: 'visible' });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }
}
`;

    const portalPageTs = `import type { Page, Locator } from '@playwright/test';

export class InsurancePortalPage {
  readonly page: Page;
  readonly portalHeading: Locator;
  readonly policySelect: Locator;
  readonly incidentDateInput: Locator;
  readonly lossTypeSelect: Locator;
  readonly estimatedAmountInput: Locator;
  readonly descriptionInput: Locator;
  readonly documentNameInput: Locator;
  readonly submitClaimButton: Locator;
  readonly claimFeedbackBanner: Locator;
  readonly claimsTable: Locator;
  readonly adjusterNoteInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.portalHeading = page.getByTestId('demo-portal-heading');
    this.policySelect = page.getByTestId('fnol-policy-select');
    this.incidentDateInput = page.getByTestId('fnol-incident-date');
    this.lossTypeSelect = page.getByTestId('fnol-loss-type');
    this.estimatedAmountInput = page.getByTestId('fnol-estimated-amount');
    this.descriptionInput = page.getByTestId('fnol-description');
    this.documentNameInput = page.getByTestId('fnol-document-name');
    this.submitClaimButton = page.getByTestId('fnol-submit-btn');
    this.claimFeedbackBanner = page.getByTestId('fnol-feedback');
    this.claimsTable = page.getByTestId('demo-claims-table');
    this.adjusterNoteInput = page.getByTestId('adjuster-review-note');
  }

  async submitClaim(data: {
    policyNumber: string;
    incidentDate: string;
    lossType: string;
    estimatedAmount: string;
    description: string;
    documentName: string;
  }) {
    await this.policySelect.selectOption(data.policyNumber);
    await this.incidentDateInput.fill(data.incidentDate);
    await this.lossTypeSelect.selectOption(data.lossType);
    await this.estimatedAmountInput.fill(data.estimatedAmount);
    await this.descriptionInput.fill(data.description);
    await this.documentNameInput.fill(data.documentName);
    await this.submitClaimButton.click();
  }
}
`;

    const fixturesTs = `import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InsurancePortalPage } from '../pages/InsurancePortalPage';

type ArchitectFixtures = {
  loginPage: LoginPage;
  portalPage: InsurancePortalPage;
  targetUrl: string;
};

export const test = base.extend<ArchitectFixtures>({
  targetUrl: async ({}, use) => {
    await use('${targetUrl.replace(/'/g, "\\'")}');
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  portalPage: async ({ page }, use) => {
    await use(new InsurancePortalPage(page));
  },
});

export { expect };
`;

    const testDataJson = JSON.stringify(
      {
        targetUrl,
        accounts: {
          customer: { email: 'customer@veridian.test', pass: 'CustomerPass!2026' },
          adjuster: { email: 'adjuster@veridian.test', pass: 'AdjusterPass!2026' },
          locked: { email: 'locked@veridian.test', pass: 'LockedPass!2026' },
        },
        validClaim: {
          policyNumber: 'POL-2026-1001',
          incidentDate: '2026-10-15',
          lossType: 'Water Damage',
          estimatedAmount: '4500',
          description: 'Burst upstairs pipe caused kitchen ceiling water damage.',
          documentName: 'plumber-invoice.pdf',
        },
        duplicateClaim: {
          policyNumber: 'POL-2026-1001',
          incidentDate: '2026-09-12',
          lossType: 'Collision',
          estimatedAmount: '3200',
          description: 'Duplicate collision submission test.',
          documentName: 'repair-quote.pdf',
        },
      },
      null,
      2
    );

    const authScenarios = input.scenarios.filter(
      (s) => s.title.toLowerCase().includes('login') || s.tags.includes('auth')
    );
    const claimScenarios = input.scenarios.filter(
      (s) => !authScenarios.some((a) => a.testCaseId === s.testCaseId)
    );

    const buildTestBlock = (s: TestScenarioItem): string => {
      const lower = s.title.toLowerCase();
      const reqTag = s.requirementIds.join(', ');
      const header = `  // Requirement: ${reqTag} | Scenario: ${s.testCaseId}\n  test('${s.testCaseId} [${reqTag}]: ${s.title.replace(/'/g, "\\'")}', async ({ loginPage, portalPage, targetUrl, request }) => {`;

      if (lower.includes('invalid password') || lower.includes('invalid credentials')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, 'WrongPassword99');
    await expect(loginPage.authErrorBanner).toBeVisible();
    await expect(loginPage.authErrorBanner).toContainText(/invalid/i);
  });`;
      }
      if (lower.includes('locked')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.locked.email, data.accounts.locked.pass);
    await expect(loginPage.authErrorBanner).toBeVisible();
    await expect(loginPage.authErrorBanner).toContainText(/locked/i);
  });`;
      }
      if (lower.includes('login') && (lower.includes('valid') || s.testType === 'Positive')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, data.accounts.customer.pass);
    await expect(portalPage.portalHeading).toBeVisible();
    await expect(portalPage.claimsTable).toBeVisible();
  });`;
      }
      if (lower.includes('policy')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, data.accounts.customer.pass);
    await expect(portalPage.portalHeading).toBeVisible();
    await expect(portalPage.page.getByText('POL-2026-1001').first()).toBeVisible();
  });`;
      }
      if (lower.includes('future incident date')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, data.accounts.customer.pass);
    await portalPage.submitClaim({
      ...data.validClaim,
      incidentDate: '2099-01-15',
    });
    await expect(portalPage.claimFeedbackBanner).toBeVisible();
    await expect(portalPage.claimFeedbackBanner).toContainText(/future/i);
  });`;
      }
      if (lower.includes('duplicate')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, data.accounts.customer.pass);
    await portalPage.submitClaim(data.duplicateClaim);
    await expect(portalPage.claimFeedbackBanner).toBeVisible();
    await expect(portalPage.claimFeedbackBanner).toContainText(/duplicate/i);
  });`;
      }
      if (lower.includes('extension') || lower.includes('upload') || lower.includes('executable')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, data.accounts.customer.pass);
    await portalPage.submitClaim({
      ...data.validClaim,
      documentName: 'payload.exe',
    });
    await expect(portalPage.claimFeedbackBanner).toBeVisible();
    await expect(portalPage.claimFeedbackBanner).toContainText(/extension|allowed|pdf/i);
  });`;
      }
      if (lower.includes('adjuster') && lower.includes('reject')) {
        return `${header}
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.adjuster.email, data.accounts.adjuster.pass);
    await expect(portalPage.portalHeading).toBeVisible();
    const firstRejectBtn = portalPage.page.getByTestId('adjuster-reject-btn').first();
    await expect(firstRejectBtn).toBeVisible();
    await firstRejectBtn.click();
    await expect(portalPage.claimFeedbackBanner).toContainText(/note|reason|required/i);
  });`;
      }
      if (lower.includes('adjuster')) {
        return `${header}
    const resetUrl = new URL('/api/demo-insurance/reset', targetUrl).toString();
    await request.post(resetUrl);
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.adjuster.email, data.accounts.adjuster.pass);
    await expect(portalPage.portalHeading).toBeVisible();
    await portalPage.adjusterNoteInput.fill('Verified estimate and coverage eligibility.');
    const approveBtn = portalPage.page.getByTestId('adjuster-approve-btn').first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    await expect(portalPage.claimFeedbackBanner).toContainText(/approved/i);
  });`;
      }

      return `${header}
    const resetUrl = new URL('/api/demo-insurance/reset', targetUrl).toString();
    await request.post(resetUrl);
    await loginPage.goto(targetUrl);
    await loginPage.login(data.accounts.customer.email, data.accounts.customer.pass);
    await portalPage.submitClaim(data.validClaim);
    await expect(portalPage.claimFeedbackBanner).toBeVisible();
    await expect(portalPage.claimFeedbackBanner).toContainText(/submitted/i);
  });`;
    };

    const files: GeneratedAutomationOutput['files'] = [
      {
        relativePath: 'pages/LoginPage.ts',
        fileCategory: 'PAGE_OBJECT',
        content: loginPageTs,
        locators: [
          "getByTestId('demo-login-email')",
          "getByTestId('demo-login-password')",
          "getByTestId('demo-login-submit')",
          "getByTestId('demo-auth-error')",
        ],
        linkedReqIds: allReqIds,
      },
      {
        relativePath: 'pages/InsurancePortalPage.ts',
        fileCategory: 'PAGE_OBJECT',
        content: portalPageTs,
        locators: [
          "getByTestId('demo-portal-heading')",
          "getByTestId('fnol-policy-select')",
          "getByTestId('fnol-incident-date')",
          "getByTestId('fnol-submit-btn')",
          "getByTestId('demo-claims-table')",
        ],
        linkedReqIds: allReqIds,
      },
      {
        relativePath: 'fixtures/testFixtures.ts',
        fileCategory: 'FIXTURE',
        content: fixturesTs,
        locators: [],
        linkedReqIds: allReqIds,
      },
      {
        relativePath: 'test-data/insurance-data.json',
        fileCategory: 'TEST_DATA',
        content: testDataJson,
        locators: [],
        linkedReqIds: allReqIds,
      },
    ];

    if (authScenarios.length > 0) {
      const authSpec = `import { test, expect } from '../fixtures/testFixtures';
import data from '../test-data/insurance-data.json' with { type: 'json' };

test.describe('Authentication & Access Control', () => {
${authScenarios.map(buildTestBlock).join('\n\n')}
});
`;
      files.push({
        relativePath: 'tests/auth.spec.ts',
        fileCategory: 'TEST_SPEC',
        content: authSpec,
        locators: ["getByTestId('demo-login-email')", "getByTestId('demo-auth-error')"],
        linkedReqIds: Array.from(new Set(authScenarios.flatMap((s) => s.requirementIds))),
      });
    }

    if (claimScenarios.length > 0) {
      const claimsSpec = `import { test, expect } from '../fixtures/testFixtures';
import data from '../test-data/insurance-data.json' with { type: 'json' };

test.describe('Policies, FNOL Claims & Adjuster Workflows', () => {
${claimScenarios.map(buildTestBlock).join('\n\n')}
});
`;
      files.push({
        relativePath: 'tests/claims-workflow.spec.ts',
        fileCategory: 'TEST_SPEC',
        content: claimsSpec,
        locators: [
          "getByTestId('fnol-policy-select')",
          "getByTestId('fnol-submit-btn')",
          "getByTestId('demo-claims-table')",
        ],
        linkedReqIds: Array.from(new Set(claimScenarios.flatMap((s) => s.requirementIds))),
      });
    }

    return GeneratedAutomationOutputSchema.parse({
      files,
      architectureNotes:
        'Generated deterministic Page Object Model suite using resilient data-testid locators, isolated test data JSON, and parallel-safe Playwright fixtures.',
    });
  }

  private generateGenericExploredAutomation(input: AutomationInput): GeneratedAutomationOutput {
    const targetUrl = input.targetUrl;
    const allReqIds = Array.from(new Set(input.scenarios.flatMap((s) => s.requirementIds)));
    const pageTitle = input.exploration?.pageTitle || input.applicationName;

    const pageTs = `import type { Page, Locator } from '@playwright/test';

export class TargetAppPage {
  readonly page: Page;
  readonly mainRegion: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mainRegion = page.locator('body');
  }

  async goto(url: string) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.mainRegion.waitFor({ state: 'visible' });
  }
}
`;
    const fixturesTs = `import { test as base, expect } from '@playwright/test';
import { TargetAppPage } from '../pages/TargetAppPage';

export const test = base.extend<{ appPage: TargetAppPage; targetUrl: string }>({
  targetUrl: async ({}, use) => {
    await use('${targetUrl.replace(/'/g, "\\'")}');
  },
  appPage: async ({ page }, use) => {
    await use(new TargetAppPage(page));
  },
});

export { expect };
`;

    const testBlocks = input.scenarios
      .map((s) => {
        const reqTag = s.requirementIds.join(', ');
        return `  // Requirement: ${reqTag} | Scenario: ${s.testCaseId}
  test('${s.testCaseId} [${reqTag}]: ${s.title.replace(/'/g, "\\'")}', async ({ appPage, targetUrl }) => {
    await appPage.goto(targetUrl);
    await expect(appPage.mainRegion).toBeVisible();
  });`;
      })
      .join('\n\n');

    const specTs = `import { test, expect } from '../fixtures/testFixtures';

test.describe('${pageTitle.replace(/'/g, "\\'")}', () => {
${testBlocks}
});
`;

    return GeneratedAutomationOutputSchema.parse({
      files: [
        {
          relativePath: 'pages/TargetAppPage.ts',
          fileCategory: 'PAGE_OBJECT',
          content: pageTs,
          locators: ["locator('body')"],
          linkedReqIds: allReqIds,
        },
        {
          relativePath: 'fixtures/testFixtures.ts',
          fileCategory: 'FIXTURE',
          content: fixturesTs,
          locators: [],
          linkedReqIds: allReqIds,
        },
        {
          relativePath: 'test-data/suite-data.json',
          fileCategory: 'TEST_DATA',
          content: JSON.stringify({ targetUrl, scenarios: input.scenarios.map((s) => s.testCaseId) }, null, 2),
          locators: [],
          linkedReqIds: allReqIds,
        },
        {
          relativePath: 'tests/workflow.spec.ts',
          fileCategory: 'TEST_SPEC',
          content: specTs,
          locators: ["locator('body')"],
          linkedReqIds: allReqIds,
        },
      ],
      architectureNotes:
        'Generated Page Object Model scaffold from explored DOM summary and approved test scenarios.',
    });
  }

  async analyzeFailure(input: FailureInput): Promise<FailureAnalysis> {
    const failed = input.results.filter((r) => r.status !== 'PASSED' && r.status !== 'SKIPPED');
    const passRate =
      input.runSummary.totalTests > 0
        ? Math.round((input.runSummary.passedTests / input.runSummary.totalTests) * 100)
        : 0;

    return FailureAnalysisSchema.parse({
      overallSummary:
        failed.length === 0
          ? `Execution run on ${input.runSummary.browser} completed with ${input.runSummary.passedTests}/${input.runSummary.totalTests} tests passing (${passRate}%) in ${(input.runSummary.durationMs / 1000).toFixed(2)}s. Requirement coverage stands at ${input.coverageSummary.coveragePercent}%.`
          : `Execution run on ${input.runSummary.browser} recorded ${failed.length} failure(s) out of ${input.runSummary.totalTests} tests (${passRate}% pass rate). Immediate triage is recommended for failed assertions.`,
      criticalFailures: failed.map(
        (f) => `${f.testCaseId ?? 'TEST'}: ${f.testTitle} — ${f.errorMessage || 'Assertion failed'}`
      ),
      potentialRootCauses:
        failed.length > 0
          ? [
              'DOM locator mismatch or state transition timing difference in target application.',
              'Seed data precondition mismatch or validation message copy divergence.',
            ]
          : ['No failures detected in the current execution run.'],
      failedWorkflows: failed.map((f) => f.testTitle),
      missingCoverage:
        input.coverageSummary.uncoveredReqCodes.length > 0
          ? input.coverageSummary.uncoveredReqCodes.map(
              (code) => `${code} currently lacks linked test scenario coverage.`
            )
          : ['All analyzed requirements have mapped test scenarios.'],
      recommendedAdditionalTests: [
        'Add cross-browser regression run on Firefox and WebKit for critical FNOL submission.',
        'Add API contract assertions for role-based authorization boundaries.',
      ],
      suggestedRegressionSuite: input.results
        .filter((r) => r.testCaseId)
        .slice(0, 6)
        .map((r) => `${r.testCaseId}: ${r.testTitle}`),
    });
  }
}
