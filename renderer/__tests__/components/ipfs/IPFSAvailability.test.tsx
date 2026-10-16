import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { IpfsProvider } from "@/components/ipfs/IPFSContext";
import DesktopIpfsNavItem from "@/components/layout/sidebar/nav/DesktopIpfsNavItem";

jest.mock("@/helpers", () => ({ isElectron: () => true }));
jest.mock("@/components/ipfs/IPFSService", () =>
  jest.fn().mockImplementation(() => ({ init: () => Promise.resolve() }))
);

const readyInfo = {
  status: "ready",
  apiEndpoint: "http://127.0.0.1:5001",
  gatewayEndpoint: "http://127.0.0.1:8080",
};

describe("Desktop IPFS menu availability", () => {
  const originalApi = window.api;

  afterEach(() => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: originalApi,
    });
  });

  it("keeps one row through startup, failure and late recovery, ignoring stale results", async () => {
    let initialResult: (value: unknown) => void = () => undefined;
    let notify: (status: "ready" | "unavailable") => void = () => undefined;
    const unsubscribe = jest.fn();
    const getIpfsInfo = jest.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          initialResult = resolve;
        })
    );
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        getIpfsInfo,
        onIpfsStatusChange: (callback: typeof notify) => {
          notify = callback;
          return unsubscribe;
        },
      },
    });
    const onNavigate = jest.fn();
    const { unmount } = render(
      <IpfsProvider>
        <DesktopIpfsNavItem className="" onNavigate={onNavigate} />
      </IpfsProvider>
    );
    const row = screen.getByRole("link", { name: "My IPFS: starting" });
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).not.toHaveAttribute("href");
    expect(row.querySelector('[data-icon="spinner"]')).not.toBeNull();
    fireEvent.click(row);
    expect(onNavigate).not.toHaveBeenCalled();

    getIpfsInfo.mockResolvedValue(readyInfo);
    await act(async () => {
      notify("ready");
    });
    await waitFor(() =>
      expect(row).toHaveAttribute("href", "http://127.0.0.1:5001/webui")
    );
    expect(screen.getByRole("link", { name: "My IPFS" })).toBe(row);
    expect(row).not.toHaveAttribute("aria-disabled");

    await act(async () => {
      initialResult({ status: "unavailable" });
    });
    expect(row).toHaveAttribute("href", "http://127.0.0.1:5001/webui");

    act(() => {
      notify("unavailable");
    });
    expect(screen.getByRole("link", { name: "My IPFS: unavailable" })).toBe(
      row
    );
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row).not.toHaveAttribute("href");
    expect(
      row.querySelector('[data-icon="triangle-exclamation"]')
    ).not.toBeNull();
    fireEvent.click(row);
    expect(onNavigate).not.toHaveBeenCalled();

    await act(async () => {
      notify("ready");
    });
    await waitFor(() =>
      expect(row).toHaveAttribute("href", "http://127.0.0.1:5001/webui")
    );
    expect(screen.getByRole("link", { name: "My IPFS" })).toBe(row);
    fireEvent.click(row);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
