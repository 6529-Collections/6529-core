import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DesktopUpdateModal from "@/components/header/titlebar/DesktopUpdateModal";

describe("DesktopUpdateModal", () => {
  it("renders the localized update details and focuses the close button", async () => {
    render(
      <DesktopUpdateModal open version="0.3.11" onClose={jest.fn()} />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Update Available" })
    ).toBeInTheDocument();
    expect(screen.getByText("Version 0.3.11 is available.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Open App Info to install the update.",
      })
    ).toHaveAttribute("href", "/core/core-info");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()
    );
  });

  it("closes when Escape is pressed", async () => {
    const onClose = jest.fn();
    render(<DesktopUpdateModal open version="0.3.11" onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes from the close button", () => {
    const onClose = jest.fn();
    render(<DesktopUpdateModal open version="0.3.11" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
