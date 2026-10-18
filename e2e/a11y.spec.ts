import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES, settle } from "./helpers";

// Automated accessibility checks (axe-core, WCAG 2.2 A and AA rules) on every
// page in both colour schemes. Automated tools catch roughly a third of real
// problems; keyboard use still needs the behaviour tests and a human.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const path of PAGES) {
      test(`${path} has no axe violations @readonly`, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          // The Turnstile widget is Cloudflare's iframe, not the lab's markup.
          .exclude("iframe[src*='challenges.cloudflare.com']")
          .analyze();
        const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
        expect(summary).toEqual([]);
      });
    }
  });
}
