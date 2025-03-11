import { test, expect } from "../../testHelpers";
import { login, mockApiResponse } from "../../testHelpers";

test.describe("ENS App", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Login if needed and navigate to the ENS app
    if (baseURL) {
      await login(page, baseURL);
    }
    await page.goto("/apps/ens");
  });

  test("should load the ENS app correctly", async ({ page }) => {
    // Check if the page title contains the app name
    await expect(page).toHaveTitle(/ENS/);

    // Check if the main heading is visible
    const heading = page.locator("h1", { hasText: "ENS Lookup" });
    await expect(heading).toBeVisible();

    // Check if the input field is visible
    const inputField = page.locator(
      "input[placeholder='Enter ENS name or Ethereum address']"
    );
    await expect(inputField).toBeVisible();

    // Check if the lookup button is visible
    const lookupButton = page.locator("button", { hasText: "Lookup" });
    await expect(lookupButton).toBeVisible();
  });

  test("should perform ENS lookup for a valid ENS name", async ({ page }) => {
    const mockAddress = "0x1234567890123456789012345678901234567890";

    // Mock the ENS resolution API response
    await mockApiResponse(page, "**/api/ens/resolve**", {
      address: mockAddress,
    });

    // Enter an ENS name
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      "vitalik.eth"
    );

    // Click the lookup button
    await page.click("button:has-text('Lookup')");

    // Check if the resolved address is displayed
    await expect(page.locator(`text=${mockAddress}`)).toBeVisible();
  });

  test("should perform reverse lookup for a valid Ethereum address", async ({
    page,
  }) => {
    const mockEnsName = "vitalik.eth";
    const address = "0x1234567890123456789012345678901234567890";

    // Mock the reverse lookup API response
    await mockApiResponse(page, "**/api/ens/reverse**", { name: mockEnsName });

    // Enter an Ethereum address
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      address
    );

    // Click the lookup button
    await page.click("button:has-text('Lookup')");

    // Check if the resolved ENS name is displayed
    await expect(page.locator(`text=${mockEnsName}`)).toBeVisible();
  });

  test("should display error message for invalid input", async ({ page }) => {
    // Mock the API to return an error
    await mockApiResponse(page, "**/api/ens/resolve**", {
      error: "Invalid ENS name",
    });

    // Enter an invalid ENS name
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      "invalid.eth"
    );

    // Click the lookup button
    await page.click("button:has-text('Lookup')");

    // Check if error message is displayed
    await expect(page.locator("text=Invalid ENS name")).toBeVisible();
  });

  test("should display loading state during lookup", async ({ page }) => {
    // Create a slow response to observe loading state
    await page.route("**/api/ens/resolve**", async (route) => {
      // Delay the response to simulate loading
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          address: "0x1234567890123456789012345678901234567890",
        }),
      });
    });

    // Enter an ENS name
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      "vitalik.eth"
    );

    // Click the lookup button
    await page.click("button:has-text('Lookup')");

    // Check if loading indicator is displayed
    await expect(page.locator("text=Loading...")).toBeVisible();
  });

  test("should handle empty input gracefully", async ({ page }) => {
    // Click the lookup button without entering anything
    await page.click("button:has-text('Lookup')");

    // Check if validation message is displayed
    await expect(
      page.locator("text=Please enter an ENS name or Ethereum address")
    ).toBeVisible();
  });

  test("should copy resolved address to clipboard", async ({ page }) => {
    const mockAddress = "0x1234567890123456789012345678901234567890";

    // Mock the ENS resolution API response
    await mockApiResponse(page, "**/api/ens/resolve**", {
      address: mockAddress,
    });

    // Enter an ENS name
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      "vitalik.eth"
    );

    // Click the lookup button
    await page.click("button:has-text('Lookup')");

    // Wait for the result to appear
    await expect(page.locator(`text=${mockAddress}`)).toBeVisible();

    // Click the copy button (assuming there's a copy button with a specific icon or text)
    await page.click("button[aria-label='Copy to clipboard']");

    // Check if confirmation message is displayed
    await expect(page.locator("text=Copied to clipboard")).toBeVisible();
  });

  test("should clear results when input changes", async ({ page }) => {
    const mockAddress = "0x1234567890123456789012345678901234567890";

    // Mock the ENS resolution API response
    await mockApiResponse(page, "**/api/ens/resolve**", {
      address: mockAddress,
    });

    // Enter an ENS name
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      "vitalik.eth"
    );

    // Click the lookup button
    await page.click("button:has-text('Lookup')");

    // Wait for the result to appear
    await expect(page.locator(`text=${mockAddress}`)).toBeVisible();

    // Change the input
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      ""
    );
    await page.fill(
      "input[placeholder='Enter ENS name or Ethereum address']",
      "different.eth"
    );

    // Check if the previous result is no longer visible
    await expect(page.locator(`text=${mockAddress}`)).not.toBeVisible();
  });
});
