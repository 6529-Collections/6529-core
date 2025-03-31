import { test, expect } from "../../testHelpers";
import { login, mockApiResponse } from "../../testHelpers";

test.describe("Uniswap App", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Login if needed and navigate to the Swap app
    if (baseURL) {
      await login(page, baseURL);
    }
    await page.goto("/apps/swap");
  });

  test("should render the Uniswap app correctly", async ({ page }) => {
    // Check if the title is rendered
    await expect(page.locator("h1:has-text('Swap')")).toBeVisible();

    // Check if the token input fields are rendered
    await expect(page.locator("input[placeholder='0']").first()).toBeVisible();
    await expect(page.locator("input[placeholder='0']").last()).toBeVisible();

    // Check if the swap button is rendered
    await expect(page.locator("button:has-text('Swap')")).toBeVisible();
  });

  test("should allow selecting tokens", async ({ page }) => {
    // Click on the first token selector
    await page.click("button:has-text('Select token').first");

    // Check if token list is displayed
    await expect(page.locator("text=Select a token")).toBeVisible();

    // Select ETH
    await page.click("text=ETH");

    // Check if ETH is selected
    await expect(page.locator("button:has-text('ETH')")).toBeVisible();

    // Click on the second token selector
    await page.click("button:has-text('Select token').last");

    // Select USDC
    await page.click("text=USDC");

    // Check if USDC is selected
    await expect(page.locator("button:has-text('USDC')")).toBeVisible();
  });

  test("should display token price and exchange rate", async ({ page }) => {
    // Mock token price API response
    await mockApiResponse(page, "**/api/price**", {
      ETH: { USD: 3000 },
      USDC: { USD: 1 },
    });

    // Select ETH and USDC
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");

    // Check if price information is displayed
    await expect(page.locator("text=1 ETH = 3000 USDC")).toBeVisible();
  });

  test("should update output amount when input amount changes", async ({
    page,
  }) => {
    // Mock token price and quote API responses
    await mockApiResponse(page, "**/api/price**", {
      ETH: { USD: 3000 },
      USDC: { USD: 1 },
    });

    await mockApiResponse(page, "**/api/quote**", {
      outputAmount: "3000",
      priceImpact: "0.1",
      route: "Direct",
    });

    // Select ETH and USDC
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");

    // Enter amount in the input field
    await page.fill("input[placeholder='0']", "1");

    // Check if output amount is updated
    await expect(page.locator("input[placeholder='0']").last()).toHaveValue(
      "3000"
    );
  });

  test("should display gas fees and price impact", async ({ page }) => {
    // Mock necessary API responses
    await mockApiResponse(page, "**/api/gas**", {
      gasPrice: "50",
      estimatedGas: "150000",
    });

    await mockApiResponse(page, "**/api/quote**", {
      outputAmount: "3000",
      priceImpact: "0.5",
      route: "Direct",
    });

    // Select tokens and enter amount
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");
    await page.fill("input[placeholder='0']", "1");

    // Check if gas fees are displayed
    await expect(page.locator("text=Gas fee:")).toBeVisible();

    // Check if price impact is displayed
    await expect(page.locator("text=Price Impact: 0.5%")).toBeVisible();
  });

  test("should swap tokens when clicking the swap direction button", async ({
    page,
  }) => {
    // Select ETH and USDC
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");

    // Click the swap direction button
    await page.click("button[aria-label='Swap direction']");

    // Check if tokens are swapped
    await expect(page.locator("button:has-text('USDC')").first()).toBeVisible();
    await expect(page.locator("button:has-text('ETH')").last()).toBeVisible();
  });

  test("should show wallet connection prompt if not connected", async ({
    page,
  }) => {
    // Mock wallet connection status
    await mockApiResponse(page, "**/api/wallet/status**", {
      connected: false,
    });

    // Try to perform a swap
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");
    await page.fill("input[placeholder='0']", "1");
    await page.click("button:has-text('Swap')");

    // Check if wallet connection prompt is displayed
    await expect(page.locator("text=Connect Wallet to Swap")).toBeVisible();
  });

  test("should show confirmation dialog before swap", async ({ page }) => {
    // Mock wallet connection status
    await mockApiResponse(page, "**/api/wallet/status**", {
      connected: true,
      address: "0x1234567890123456789012345678901234567890",
    });

    // Mock quote API
    await mockApiResponse(page, "**/api/quote**", {
      outputAmount: "3000",
      priceImpact: "0.1",
      route: "Direct",
    });

    // Select tokens and enter amount
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");
    await page.fill("input[placeholder='0']", "1");

    // Click swap button
    await page.click("button:has-text('Swap')");

    // Check if confirmation dialog is displayed
    await expect(page.locator("text=Confirm Swap")).toBeVisible();
    await expect(page.locator("text=1 ETH for 3000 USDC")).toBeVisible();
  });

  test("should show transaction status after confirming swap", async ({
    page,
  }) => {
    // Mock wallet and transaction APIs
    await mockApiResponse(page, "**/api/wallet/status**", {
      connected: true,
      address: "0x1234567890123456789012345678901234567890",
    });

    await mockApiResponse(page, "**/api/quote**", {
      outputAmount: "3000",
      priceImpact: "0.1",
      route: "Direct",
    });

    await mockApiResponse(page, "**/api/swap**", {
      txHash:
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: "pending",
    });

    // Select tokens and enter amount
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");
    await page.fill("input[placeholder='0']", "1");

    // Click swap button
    await page.click("button:has-text('Swap')");

    // Confirm swap in the dialog
    await page.click("button:has-text('Confirm')");

    // Check if transaction status is displayed
    await expect(page.locator("text=Transaction Submitted")).toBeVisible();
    await expect(page.locator("text=View on Explorer")).toBeVisible();
  });

  test("should handle insufficient balance errors", async ({ page }) => {
    // Mock wallet status with low balance
    await mockApiResponse(page, "**/api/wallet/status**", {
      connected: true,
      address: "0x1234567890123456789012345678901234567890",
      balances: {
        ETH: "0.1",
      },
    });

    // Select tokens and enter amount higher than balance
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");
    await page.fill("input[placeholder='0']", "1");

    // Check if insufficient balance warning is displayed
    await expect(page.locator("text=Insufficient balance")).toBeVisible();

    // Swap button should be disabled
    await expect(page.locator("button:has-text('Swap')")).toBeDisabled();
  });

  test("should handle high price impact warnings", async ({ page }) => {
    // Mock quote API with high price impact
    await mockApiResponse(page, "**/api/quote**", {
      outputAmount: "2700",
      priceImpact: "10.5",
      route: "Direct",
    });

    // Select tokens and enter amount
    await page.click("button:has-text('Select token').first");
    await page.click("text=ETH");
    await page.click("button:has-text('Select token').last");
    await page.click("text=USDC");
    await page.fill("input[placeholder='0']", "1");

    // Check if high price impact warning is displayed
    await expect(page.locator("text=Price Impact: 10.5%")).toBeVisible();
    await expect(page.locator("text=High price impact")).toBeVisible();
  });

  test("should display transaction history if available", async ({ page }) => {
    // Mock transaction history API
    await mockApiResponse(page, "**/api/transactions**", [
      {
        hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        from: "0x1234567890123456789012345678901234567890",
        tokenIn: "ETH",
        tokenOut: "USDC",
        amountIn: "1",
        amountOut: "3000",
        timestamp: Date.now() - 3600000,
      },
    ]);

    // Navigate to transaction history section (if it exists)
    const historyTab = page.locator("text=History");
    if ((await historyTab.count()) > 0) {
      await historyTab.click();

      // Check if transaction history is displayed
      await expect(page.locator("text=ETH → USDC")).toBeVisible();
      await expect(page.locator("text=1 ETH for 3000 USDC")).toBeVisible();
    }
  });
});
