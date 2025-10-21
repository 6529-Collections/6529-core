import { expect, test } from "../testHelpers";

test.describe("BUIDL Page", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto("/buidl");
  });

  test("should load with correct title and heading", async ({ page }) => {
    await expect(page).toHaveTitle("BUIDL | 6529 Desktop");

    const heading = page.locator("h4");
    await expect(heading).toContainText("We are going to BUIDL together");
    await expect(heading).toBeVisible();
  });
});
