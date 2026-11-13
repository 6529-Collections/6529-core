import { useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DesktopProfileStorageGate from "@/components/core/DesktopProfileStorageGate";
import { DesktopProfileRecoveryContext } from "@/contexts/DesktopProfileRecoveryContext";
import { restoreDesktopProfileState } from "@/services/auth/auth.utils";
import { persistDesktopProfiles } from "@/services/auth/desktop-profile-storage";

jest.mock("@/services/auth/auth.utils", () => ({
  getConnectedWalletAccounts: () => [],
  getWalletAddress: () => null,
  restoreDesktopProfileState: jest.fn(),
}));

const emptyState = { version: 1, accounts: [], activeAddress: null } as const;

function AppContent() {
  const recovering = useContext(DesktopProfileRecoveryContext);
  return (
    <div>{recovering ? "Public content" : "Automatic sign-in enabled"}</div>
  );
}

afterEach(() => {
  delete window.nativeAuth;
});

it("opens signed out after a denied restore and restarts the app on request", async () => {
  const restoreProfiles = jest
    .fn()
    .mockRejectedValue(new Error("Keychain denied"));
  const profilesReady = jest.fn().mockResolvedValue(undefined);
  const saveProfiles = jest.fn().mockResolvedValue(undefined);
  const restartProfileRestore = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "nativeAuth", {
    configurable: true,
    value: {
      restoreProfiles,
      profilesReady,
      saveProfiles,
      restartProfileRestore,
    },
  });
  jest
    .mocked(restoreDesktopProfileState)
    .mockImplementation(persistDesktopProfiles);

  render(
    <DesktopProfileStorageGate>
      <AppContent />
    </DesktopProfileStorageGate>
  );

  expect(await screen.findByText("Public content")).toBeVisible();
  expect(restoreDesktopProfileState).toHaveBeenCalledWith(emptyState);
  expect(saveProfiles).not.toHaveBeenCalled();
  await waitFor(() => expect(profilesReady).toHaveBeenCalled());

  await userEvent.click(
    screen.getByRole("button", { name: "Restart to restore profiles" })
  );
  expect(restartProfileRestore).toHaveBeenCalledTimes(1);
  expect(restoreProfiles).toHaveBeenCalledTimes(1);
});
