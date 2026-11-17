import { test, expect } from '@playwright/test';

test.describe('AI Test Architect Platform E2E Workflow', () => {
  test('executes full requirement-to-Playwright-report journey in UI', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('AI Test Architect').first()).toBeVisible();

    // Switch to explicit Deterministic Mock demo provider via Settings for repeatable E2E
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('provider-mode-mock').click();
    await page.getByTestId('nav-dashboard').click();

    // Step 1: Bootstrap demo project
    await page.getByTestId('bootstrap-demo-btn').click();
    await expect(page.getByTestId('analyze-requirements-btn')).toBeVisible();

    // Step 2-3: Analyze requirements
    await page.getByTestId('analyze-requirements-btn').click();
    await expect(page.getByText('REQ-001').first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId('approve-all-reqs-btn').click();

    // Step 4: Generate & approve test scenarios
    await page.getByTestId('nav-test-plans').click();
    await page.getByTestId('generate-test-plan-btn').click();
    await expect(page.getByText('TC-001').first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId('approve-scenarios-btn').click();

    // Step 5-7: Explore application, generate automation, and approve Code Review
    await page.getByTestId('nav-automation').click();
    await page.getByTestId('explore-app-btn').click();
    await expect(page.getByText('Veridian P&C Insurance').first()).toBeVisible({ timeout: 25000 });

    await page.getByTestId('generate-automation-btn').click();
    await expect(page.getByText('pages/LoginPage.ts').first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /Code Review Gate/i }).click();
    await page.getByTestId('approve-automation-btn').click();
    await expect(page.getByText('APPROVED').first()).toBeVisible();

    // Step 8: Execute Playwright tests
    await page.getByTestId('nav-execution').click();
    await page.getByTestId('run-playwright-btn').click();
    await expect(page.getByText('PASSED').first()).toBeVisible({ timeout: 90000 });

    // Step 9-10: Inspect Reports & Traceability Matrix
    await page.getByTestId('nav-reports').click();
    await expect(page.getByText('Executive QA Summary')).toBeVisible();
    await page.getByTestId('traceability-tab-btn').click();
    await expect(page.getByText('Requirement-to-Test Traceability Matrix')).toBeVisible();
    await expect(page.getByText('REQ-001').first()).toBeVisible();
  });
});
