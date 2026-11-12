import { CreateSeedWalletModal } from "@/components/core/core-wallet/SeedWalletModal";
import { createSeedWallet } from "@/electron";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/electron", () => ({
  createSeedWallet: jest.fn(),
  importSeedWallet: jest.fn(),
}));

jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

afterEach(() => {
  delete window.walletPasswords;
  jest.clearAllMocks();
});

it("requires a fresh backup confirmation before creating a wallet with a generated password", async () => {
  const password = "example-generated-password";
  const address = "0x123456789012345678901234567890123456abcd";
  const offerSave = jest.fn().mockResolvedValue({ ok: true, value: false });
  window.walletPasswords = {
    isAvailable: jest.fn().mockResolvedValue(true),
    generate: jest.fn().mockResolvedValue({ ok: true, value: password }),
    hasSavedPassword: jest.fn(),
    request: jest.fn(),
    offerSave,
    forget: jest.fn(),
  };
  jest.mocked(createSeedWallet).mockResolvedValue({ error: false, data: address });
  const user = userEvent.setup();
  const onHide = jest.fn();
  render(<CreateSeedWalletModal show onHide={onHide} />);

  await user.type(screen.getByLabelText("Wallet Name"), "My Wallet");
  await user.click(await screen.findByRole("button", { name: "Generate" }));

  const createButton = screen.getByRole("button", { name: "Create" });
  const confirmation = screen.getByRole("checkbox", { name: /saved this password/i });
  expect(createButton).toBeDisabled();
  await user.click(confirmation);
  expect(createButton).toBeEnabled();

  await user.type(screen.getByLabelText("Wallet Password"), "x");
  expect(confirmation).not.toBeChecked();
  expect(createButton).toBeDisabled();
  await user.click(confirmation);
  await user.click(createButton);

  expect(createSeedWallet).toHaveBeenCalledWith("My Wallet", `${password}x`);
  expect(offerSave).toHaveBeenCalledWith(address, `${password}x`);
  expect(onHide).toHaveBeenCalledWith(true);
});
