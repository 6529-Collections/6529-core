import type { ButtonHTMLAttributes, ReactNode } from "react";

interface WorkerActionButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "type"
  > {
  readonly children: ReactNode;
}

export default function WorkerActionButton({
  children,
  ...buttonProps
}: Readonly<WorkerActionButtonProps>) {
  return (
    <button
      {...buttonProps}
      type="button"
      className="tw-inline-flex tw-h-10 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-white tw-px-3 tw-text-sm tw-font-medium tw-text-black tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 disabled:tw-cursor-not-allowed disabled:tw-opacity-50 desktop-hover:hover:tw-bg-iron-200"
    >
      {children}
    </button>
  );
}
