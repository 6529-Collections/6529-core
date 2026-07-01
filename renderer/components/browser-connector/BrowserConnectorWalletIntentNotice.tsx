import type { ReactNode } from "react";

export type BrowserConnectorWalletIntentNoticeType =
  | {
      readonly type: "already-connected";
    }
  | {
      readonly type: "connect-requested" | "switch-requested";
      readonly address: string;
    };

export default function BrowserConnectorWalletIntentNotice({
  notice,
}: {
  readonly notice: BrowserConnectorWalletIntentNoticeType;
}) {
  const title =
    notice.type === "already-connected"
      ? "This wallet is already connected."
      : notice.type === "switch-requested"
        ? "Switch wallets before continuing."
        : "Connect the requested wallet.";
  const body: ReactNode =
    notice.type === "already-connected" ? (
      "Use a different browser wallet to add another Desktop account."
    ) : (
      <>
        Continue with{" "}
        <code className="tw-rounded-md tw-bg-error/10 tw-px-1.5 tw-py-0.5 tw-font-mono tw-text-[0.9em] tw-text-error">
          {notice.address}
        </code>
        .
      </>
    );

  return (
    <div
      className="tw-rounded-lg tw-border tw-border-solid tw-border-error/25 tw-bg-error/10 tw-px-4 tw-py-3 tw-text-error"
      role="alert"
    >
      <p className="tw-m-0 tw-text-sm tw-font-semibold tw-leading-5">
        {title}
      </p>
      <p className="tw-m-0 tw-mt-1 tw-text-sm tw-leading-5 tw-text-error/90">
        {body}
      </p>
    </div>
  );
}
