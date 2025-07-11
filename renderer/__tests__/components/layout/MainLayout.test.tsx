import { render, screen } from "@testing-library/react";
import React from "react";

const usePathname = jest.fn();
const useDeviceInfo = jest.fn();
const useAuth = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));
jest.mock("@/hooks/useDeviceInfo", () => ({
  __esModule: true,
  default: useDeviceInfo,
}));
jest.mock("@/components/auth/Auth", () => ({
  useAuth: () => useAuth(),
}));
jest.mock("@/contexts/TitleContext", () => ({
  useTitle: () => ({
    title: "Test Title",
    setTitle: jest.fn(),
    notificationCount: 0,
    setNotificationCount: jest.fn(),
    setWaveData: jest.fn(),
    setStreamHasNewItems: jest.fn(),
  }),
  TitleProvider: ({ children }: any) => children,
}));

jest.mock("@/components/layout/MobileLayout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="mobile">{children}</div>,
}));
jest.mock("@/components/layout/DesktopLayout", () => ({
  __esModule: true,
  default: ({ children, isSmall }: any) => (
    <div data-testid="desktop" data-small={isSmall ? "true" : "false"}>
      {children}
    </div>
  ),
}));

jest.mock("@/components/client-only/ClientOnly", () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));
jest.mock("@/components/navigation/ViewContext", () => ({
  ViewProvider: ({ children }: any) => <>{children}</>,
}));
jest.mock("@/contexts/NavigationHistoryContext", () => ({
  NavigationHistoryProvider: ({ children }: any) => <>{children}</>,
}));
jest.mock("@/contexts/wave/MyStreamContext", () => ({
  MyStreamProvider: ({ children }: any) => <>{children}</>,
}));
jest.mock("@/components/brain/my-stream/layout/LayoutContext", () => ({
  LayoutProvider: ({ children }: any) => <>{children}</>,
}));
jest.mock("@/contexts/ScrollPositionContext", () => ({
  ScrollPositionProvider: ({ children }: any) => <>{children}</>,
}));

const MainLayout = require("@/components/layout/MainLayout").default;

const metadata = {
  title: "Meta",
  description: "desc",
  ogImage: "image",
  twitterCard: "summary" as const,
};

beforeEach(() => {
  useAuth.mockReturnValue({});
  process.env.BASE_ENDPOINT = "https://base";
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("MainLayout", () => {
  it("returns children directly on /access routes", () => {
    usePathname.mockReturnValue("/access");
    useDeviceInfo.mockReturnValue({
      isMobileDevice: false,
      hasTouchScreen: false,
      isApp: false,
    });
    render(<MainLayout metadata={metadata}>child</MainLayout>);
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mobile")).not.toBeInTheDocument();
  });

  it("uses MobileLayout when device is mobile", () => {
    usePathname.mockReturnValue("/");
    useDeviceInfo.mockReturnValue({
      isMobileDevice: true,
      hasTouchScreen: false,
      isApp: true,
    });
    render(<MainLayout metadata={metadata}>child</MainLayout>);
    expect(screen.getByTestId("mobile")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop")).not.toBeInTheDocument();
  });

  it("passes isSmall=true for /my-stream routes", () => {
    usePathname.mockReturnValue("/my-stream");
    useDeviceInfo.mockReturnValue({
      isMobileDevice: false,
      hasTouchScreen: false,
      isApp: false,
    });
    render(<MainLayout metadata={metadata}>child</MainLayout>);
    const desktop = screen.getByTestId("desktop");
    expect(desktop).toBeInTheDocument();
    expect(desktop.getAttribute("data-small")).toBe("true");
  });

  it("passes isSmall=false on other routes", () => {
    usePathname.mockReturnValue("/other");
    useDeviceInfo.mockReturnValue({
      isMobileDevice: false,
      hasTouchScreen: false,
      isApp: false,
    });
    render(<MainLayout metadata={metadata}>child</MainLayout>);
    const desktop = screen.getByTestId("desktop");
    expect(desktop.getAttribute("data-small")).toBe("false");
  });
});
