import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { isSameApprovedOrigin, validateTargetUrl } from '../security/url-guard.ts';

export interface DiscoveredElement {
  tag: string;
  role: string | null;
  type: string | null;
  name: string | null;
  label: string | null;
  placeholder: string | null;
  testId: string | null;
  text: string | null;
  href: string | null;
  recommendedLocator: string;
}

export interface DiscoveredForm {
  id: string | null;
  action: string | null;
  method: string;
  fields: Array<{
    tag: string;
    type: string | null;
    name: string | null;
    label: string | null;
    placeholder: string | null;
    testId: string | null;
    required: boolean;
    recommendedLocator: string;
  }>;
}

export interface ExplorationResultData {
  targetUrl: string;
  pageTitle: string;
  inspectedUrls: string[];
  forms: DiscoveredForm[];
  interactiveElements: DiscoveredElement[];
  navigationPaths: string[];
  domSummary: string;
  screenshotPath: string | null;
}

export function resolveChromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  const candidates = [
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chrome-headless-shell-linux64/headless_shell',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  if (fs.existsSync('/ms-playwright')) {
    const entries = fs.readdirSync('/ms-playwright');
    for (const entry of entries) {
      if (entry.startsWith('chromium')) {
        const sub1 = path.join('/ms-playwright', entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
        if (fs.existsSync(sub1)) return sub1;
        const sub2 = path.join('/ms-playwright', entry, 'chrome-linux', 'chrome');
        if (fs.existsSync(sub2)) return sub2;
      }
    }
  }
  return undefined;
}

export async function launchSafeChromium(): Promise<Browser> {
  const executablePath = resolveChromiumExecutablePath();
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function exploreApplication(params: {
  targetUrl: string;
  explorationId: string;
  demoAuthQuickRole?: 'customer' | 'adjuster' | 'admin' | null;
}): Promise<ExplorationResultData> {
  const validation = validateTargetUrl(params.targetUrl);
  if (!validation.valid || !validation.normalizedUrl || !validation.origin) {
    throw new Error(validation.reason || 'Target URL failed security validation');
  }

  const approvedOrigin = validation.origin;
  let browser: Browser | null = null;

  try {
    browser = await launchSafeChromium();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });

    // Restrict outbound navigation to approved origin
    await context.route('**/*', async (route) => {
      const reqUrl = route.request().url();
      if (
        reqUrl.startsWith('data:') ||
        reqUrl.startsWith('blob:') ||
        isSameApprovedOrigin(reqUrl, approvedOrigin)
      ) {
        await route.continue();
      } else {
        await route.abort();
      }
    });

    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    await page.goto(validation.normalizedUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
      await page.goto(validation.normalizedUrl!, { waitUntil: 'domcontentloaded', timeout: 20000 });
    });

    // Wait briefly for React SPA hydration if root exists
    await page.waitForSelector('h1, h2, form, button, input, main', { timeout: 6000 }).catch(() => {});

    const inspectedUrls = [page.url()];

    // Optional controlled demo session exploration (never passes credentials to Gemini)
    if (params.demoAuthQuickRole && validation.normalizedUrl.includes('/demo-insurance')) {
      const quickBtn = page.getByTestId(`demo-quick-${params.demoAuthQuickRole}`);
      if ((await quickBtn.count()) > 0) {
        await quickBtn.first().click();
        await page.waitForTimeout(400);
        if (!inspectedUrls.includes(page.url())) {
          inspectedUrls.push(page.url());
        }
      }
    }

    const pageTitle = await page.title();

    const extracted = await page.evaluate(() => {
      const buildLocator = (el: Element): string => {
        const testId = el.getAttribute('data-testid');
        if (testId) return `getByTestId('${testId}')`;
        const ariaLabel = el.getAttribute('aria-label');
        const tag = el.tagName.toLowerCase();
        const role =
          el.getAttribute('role') ||
          (tag === 'button' ? 'button' : tag === 'a' ? 'link' : tag === 'select' ? 'combobox' : null);

        if (role && (ariaLabel || el.textContent?.trim())) {
          const name = (ariaLabel || el.textContent?.trim() || '').slice(0, 48).replace(/'/g, "\\'");
          if (name) return `getByRole('${role}', { name: '${name}' })`;
        }

        const id = el.getAttribute('id');
        if (id) {
          const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lbl?.textContent?.trim()) {
            return `getByLabel('${lbl.textContent.trim().slice(0, 48).replace(/'/g, "\\'")}')`;
          }
        }

        const placeholder = el.getAttribute('placeholder');
        if (placeholder) {
          return `getByPlaceholder('${placeholder.slice(0, 48).replace(/'/g, "\\'")}')`;
        }

        const text = el.textContent?.trim();
        if (text && text.length < 48) {
          return `getByText('${text.replace(/'/g, "\\'")}')`;
        }

        return `locator('${tag}')`;
      };

      const getLabelText = (el: Element): string | null => {
        const aria = el.getAttribute('aria-label');
        if (aria) return aria;
        const id = el.getAttribute('id');
        if (id) {
          const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lbl?.textContent?.trim()) return lbl.textContent.trim();
        }
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent?.trim()) return parentLabel.textContent.trim();
        return null;
      };

      const interactiveEls = Array.from(
        document.querySelectorAll('a, button, input, select, textarea, [role="button"], [data-testid]')
      )
        .slice(0, 80)
        .map((el) => {
          const tag = el.tagName.toLowerCase();
          return {
            tag,
            role: el.getAttribute('role'),
            type: el.getAttribute('type'),
            name: el.getAttribute('name'),
            label: getLabelText(el),
            placeholder: el.getAttribute('placeholder'),
            testId: el.getAttribute('data-testid'),
            text: el.textContent?.trim().slice(0, 80) || null,
            href: el.getAttribute('href'),
            recommendedLocator: buildLocator(el),
          };
        });

      const forms = Array.from(document.querySelectorAll('form'))
        .slice(0, 15)
        .map((form) => {
          const fields = Array.from(form.querySelectorAll('input, select, textarea, button'))
            .slice(0, 30)
            .map((f) => ({
              tag: f.tagName.toLowerCase(),
              type: f.getAttribute('type'),
              name: f.getAttribute('name'),
              label: getLabelText(f),
              placeholder: f.getAttribute('placeholder'),
              testId: f.getAttribute('data-testid'),
              required: f.hasAttribute('required'),
              recommendedLocator: buildLocator(f),
            }));
          return {
            id: form.getAttribute('id'),
            action: form.getAttribute('action'),
            method: (form.getAttribute('method') || 'get').toUpperCase(),
            fields,
          };
        });

      const navLinks = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((h): h is string => Boolean(h && !h.startsWith('javascript:')))
        .slice(0, 25);

      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .map((h) => h.textContent?.trim())
        .filter(Boolean)
        .slice(0, 15);

      return {
        interactiveEls,
        forms,
        navLinks: Array.from(new Set(navLinks)),
        headings,
      };
    });

    const screenshotsDir = path.resolve(process.cwd(), 'test-results', 'explorations');
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const screenshotFile = `${params.explorationId}.png`;
    const fullScreenshotPath = path.join(screenshotsDir, screenshotFile);
    await page.screenshot({ path: fullScreenshotPath, fullPage: true });

    const domSummary = [
      `Page Title: ${pageTitle || 'Untitled'}`,
      `Headings: ${extracted.headings.join(' | ') || 'None'}`,
      `Forms Discovered: ${extracted.forms.length}`,
      `Interactive Elements: ${extracted.interactiveEls.length}`,
      `Navigation Links: ${extracted.navLinks.length}`,
    ].join('\n');

    return {
      targetUrl: validation.normalizedUrl,
      pageTitle: pageTitle || 'Untitled Page',
      inspectedUrls,
      forms: extracted.forms,
      interactiveElements: extracted.interactiveEls,
      navigationPaths: extracted.navLinks,
      domSummary,
      screenshotPath: `/artifacts/explorations/${screenshotFile}`,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
