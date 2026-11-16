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

const generatedValue = "example-generated-password";
const address = "0x123456789012345678901234567890123456abcd";

async function generatePassword() {
  const offerSave = jest.fn().mockResolvedValue({ ok: true, value: false });
  const setupWithKeychain = jest.fn().mockResolvedValue({ ok: true, value: null });
  window.walletPasswords = {
    isAvailable: jest.fn().mockResolvedValue(true),
    generate: jest.fn().mockResolvedValue({ ok: true, value: generatedValue }),
    hasSavedPassword: jest.fn(),
    prepareUnlock: jest.fn(),
    cancelUnlock: jest.fn(),
    unlock: jest.fn(),
    lock: jest.fn(),
    recover: jest.fn(),
    offerSave,
    setupWithKeychain,
    forget: jest.fn(),
  };
  jest.mocked(createSeedWallet).mockResolvedValue({ error: false, data: address });
  const user = userEvent.setup();
  const onHide = jest.fn();
  render(<CreateSeedWalletModal show onHide={onHide} />);

  await user.type(screen.getByLabelText("Wallet Name"), "My Wallet");
  await user.click(await screen.findByRole("button", { name: "Generate" }));

  return { user, onHide, offerSave, setupWithKeychain };
}

it("keeps the generated password hidden and completes setup after Keychain saves it", async () => {
  const { user, onHide, offerSave, setupWithKeychain } = await generatePassword();
  expect(screen.getByLabelText("Wallet Password")).toHaveAttribute("type", "password");
  expect(screen.queryByRole("checkbox", { name: /saved this password/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Show wallet password" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Create & Save to Keychain" }));

  expect(setupWithKeychain).toHaveBeenCalledWith("My Wallet", generatedValue, undefined);
  expect(createSeedWallet).not.toHaveBeenCalled();
  expect(offerSave).not.toHaveBeenCalled();
  expect(onHide).toHaveBeenCalledWith(true);
});

it("keeps setup open after a cancelled Keychain save and allows a manual backup", async () => {
  const { user, onHide, offerSave, setupWithKeychain } = await generatePassword();
  setupWithKeychain.mockResolvedValueOnce({ ok: false, code: "cancelled" });
  await user.click(screen.getByRole("button", { name: "Create & Save to Keychain" }));
  expect(onHide).not.toHaveBeenCalled();
  expect(createSeedWallet).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save it myself" }));
  const createButton = screen.getByRole("button", { name: "Create" });
  const confirmation = screen.getByRole("checkbox", { name: /saved this password/i });
  expect(createButton).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Copy password" }));
  expect(await navigator.clipboard.readText()).toBe(generatedValue);
  await user.click(confirmation);
  await user.click(createButton);

  expect(createSeedWallet).toHaveBeenCalledWith("My Wallet", generatedValue);
  expect(offerSave).not.toHaveBeenCalled();
  expect(onHide).toHaveBeenCalledWith(true);
});

it("lets the user replace a generated password and use the normal save offer", async () => {
  const { user, onHide, offerSave, setupWithKeychain } = await generatePassword();
  await user.click(screen.getByRole("button", { name: "Use my own password" }));
  const input = screen.getByLabelText("Wallet Password");
  expect(input).toHaveValue("");
  await user.type(input, "MyOwnPassword");
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(createSeedWallet).toHaveBeenCalledWith("My Wallet", "MyOwnPassword");
  expect(offerSave).toHaveBeenCalledWith(address, "MyOwnPassword");
  expect(setupWithKeychain).not.toHaveBeenCalled();
  expect(onHide).toHaveBeenCalledWith(true);
});
