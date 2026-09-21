import {
  VersionStatusProvider,
  useVersionStatus,
} from "@/contexts/VersionStatusContext";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useSearchParams } from "next/navigation";
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(
    () => new URLSearchParams(globalThis.location.search)
  ),
}));
const updater = {
  checkUpdates: jest.fn(),
  onUpdateAvailable: jest.fn(),
  offUpdateAvailable: jest.fn(),
  onUpdateNotAvailable: jest.fn(),
  offUpdateNotAvailable: jest.fn(),
};
const getInfo = jest.fn();
function Consumer() {
  return <span>{useVersionStatus() ? "update" : "current"}</span>;
}
it("prerenders page content without reading request-only search params", () => {
  jest.mocked(useSearchParams).mockClear();
  const html = renderToString(
    <VersionStatusProvider>
      <Consumer />
    </VersionStatusProvider>
  );
  expect(html).toContain("current");
  expect(useSearchParams).not.toHaveBeenCalled();
});
beforeEach(() => {
  jest.clearAllMocks();
  globalThis.history.replaceState(null, "", "/");
  Object.defineProperty(window, "updater", {
    configurable: true,
    value: updater,
  });
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { getInfo },
  });
  getInfo.mockResolvedValue({ environment: "production" });
  globalThis.fetch = jest.fn();
});
it("subscribes before checking and cleans up native listeners", async () => {
  updater.checkUpdates.mockImplementationOnce(() =>
    updater.onUpdateAvailable.mock.calls[0][0]()
  );
  const { unmount } = render(
    <VersionStatusProvider>
      <Consumer />
    </VersionStatusProvider>
  );
  await act(async () => {});
  expect(screen.getByText("update")).toBeInTheDocument();
  expect(updater.checkUpdates).toHaveBeenCalledTimes(1);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  act(() => updater.onUpdateNotAvailable.mock.calls[0][0]());
  expect(screen.getByText("current")).toBeInTheDocument();
  unmount();
  expect(updater.offUpdateAvailable).toHaveBeenCalledWith(
    updater.onUpdateAvailable.mock.calls[0][0]
  );
  expect(updater.offUpdateNotAvailable).toHaveBeenCalledWith(
    updater.onUpdateNotAvailable.mock.calls[0][0]
  );
});
it("does not check or offer updates on isolated routes", async () => {
  globalThis.history.replaceState(
    null,
    "",
    "/browser-connector?showDesktopUpdate=true"
  );
  render(
    <VersionStatusProvider enabled={false}>
      <Consumer />
    </VersionStatusProvider>
  );
  await act(async () => {});
  expect(updater.checkUpdates).not.toHaveBeenCalled();
  expect(updater.onUpdateAvailable).not.toHaveBeenCalled();
  expect(screen.getByText("current")).toBeInTheDocument();
});
it.each(["showDesktopUpdate", "showDesktopUpdateModal"])(
  "previews %s only outside production",
  async (param) => {
    globalThis.history.replaceState(null, "", `/?${param}=true`);
    const first = render(
      <VersionStatusProvider>
        <Consumer />
      </VersionStatusProvider>
    );
    await act(async () => {});
    expect(screen.getByText("current")).toBeInTheDocument();
    first.unmount();
    getInfo.mockResolvedValue({ environment: "local" });
    render(
      <VersionStatusProvider>
        <Consumer />
      </VersionStatusProvider>
    );
    await act(async () => {});
    expect(screen.getByText("update")).toBeInTheDocument();
  }
);
