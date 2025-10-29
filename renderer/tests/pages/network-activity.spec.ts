import { expect, test } from "../testHelpers";

test.describe("Network Activity Page", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto("/network/activity");
  });

  test("should load with correct title and heading", async ({ page }) => {
    await expect(page).toHaveTitle("Network Activity | 6529 Desktop");

    const heading = page.locator("h1");
    await expect(heading).toContainText("Network Activity");
    await expect(heading).toBeVisible();
  });
});
