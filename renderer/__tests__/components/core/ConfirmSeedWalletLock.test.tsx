import ConfirmSeedWalletLock from "@/components/confirm/ConfirmSeedWalletLock";
import { ModalStateProvider } from "@/contexts/ModalStateContext";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

const ADDRESS = "0x123456789012345678901234567890123456abcd";
const ATTEMPT = "af84078e-52fd-4000-aaf4-95ebce1b2906";
const useUUID = () => jest.spyOn(crypto, "randomUUID").mockReturnValue(ATTEMPT);

function renderUnlock() {
  const prepareUnlock = jest.fn();
  const cancelUnlock = jest.fn().mockResolvedValue(undefined);
  window.walletPasswords = {
    isAvailable: jest.fn(),
    generate: jest.fn(),
    hasSavedPassword: jest.fn().mockResolvedValue(true),
    prepareUnlock,
    cancelUnlock,
    unlock: jest.fn(),
    lock: jest.fn(),
    recover: jest.fn(),
    offerSave: jest.fn(),
    forget: jest.fn(),
  };
  const onUnlock = jest.fn().mockResolvedValue(true);
  const modal = (show: boolean) => (
    <ModalStateProvider>
      <ConfirmSeedWalletLock
        address={ADDRESS}
        name="Test wallet"
        show={show}
        isUnlocked={false}
        onHide={() => undefined}
        onLock={() => undefined}
        onUnlock={onUnlock}
      />
    </ModalStateProvider>
  );
  return { prepareUnlock, cancelUnlock, onUnlock, modal };
}

beforeEach(() => {
  useUUID();
});

afterEach(() => {
  delete window.walletPasswords;
  jest.restoreAllMocks();
});

it("shows a masked saved password only after authentication and waits for Unlock", async () => {
  const { prepareUnlock, onUnlock, modal } = renderUnlock();
  let finish!: (result: { ok: true; value: null }) => void;
  prepareUnlock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const user = userEvent.setup();
  render(modal(true));

  const unlock = screen.getByRole("button", { name: "Unlock" });
  await waitFor(() => expect(prepareUnlock).toHaveBeenCalledWith(ADDRESS, ATTEMPT));
  expect(unlock).toBeDisabled();
  await act(async () => finish({ ok: true, value: null }));
  expect(screen.getByText("Password filled from Keychain.")).toBeVisible();
  expect(unlock).toBeEnabled();
  expect(onUnlock).not.toHaveBeenCalled();

  await user.click(unlock);
  expect(onUnlock).toHaveBeenCalledWith(undefined, ATTEMPT);
});

it("accepts manual entry when the macOS prompt is cancelled", async () => {
  const { prepareUnlock, onUnlock, modal } = renderUnlock();
  prepareUnlock.mockResolvedValue({ ok: false, code: "cancelled" });
  const user = userEvent.setup();
  render(modal(true));

  const unlock = screen.getByRole("button", { name: "Unlock" });
  await waitFor(() => expect(prepareUnlock).toHaveBeenCalledTimes(1));
  expect(unlock).toBeDisabled();
  await user.type(screen.getByLabelText("Wallet Password"), "manual-test-password");
  await user.click(unlock);
  expect(onUnlock).toHaveBeenCalledWith("manual-test-password", undefined);
});
