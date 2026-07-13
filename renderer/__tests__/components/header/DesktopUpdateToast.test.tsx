import { fireEvent, render, screen } from "@testing-library/react";
import DesktopUpdateToast from "@/components/header/titlebar/DesktopUpdateToast";

jest.mock("@/hooks/useBrowserLocale", () => ({
  useBrowserLocale: () => "en-US",
}));

describe("DesktopUpdateToast", () => {
  it("renders the update version and action", () => {
    const { container } = render(
      <DesktopUpdateToast open version="0.3.11" onViewUpdate={jest.fn()} />
    );

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Version 0.3.11 is available.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "View update",
      })
    ).toHaveAttribute("title", "View update");
    expect(
      document.querySelector('img[src="/rocket-refresh.png"]')
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("runs the view update action", () => {
    const onViewUpdate = jest.fn();
    render(
      <DesktopUpdateToast
        open
        version="0.3.11"
        onViewUpdate={onViewUpdate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "View update" }));

    expect(onViewUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not render while closed", () => {
    const { container } = render(
      <DesktopUpdateToast
        open={false}
        version="0.3.11"
        onViewUpdate={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
