"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { MouseEvent } from "react";
import { ConfirmModalShell } from "@/components/shared/ConfirmModalShell";
import { AUTHENTICATION_MODAL_OVERLAY_CLASS } from "@/components/shared/modal-layers";
import Button from "@/components/utils/button/Button";
import { t } from "@/i18n/messages";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { WalletIcon } from "@heroicons/react/24/outline";
import DotLoader from "../dotLoader/DotLoader";
import { formatSessionUpgradeTimeLeft } from "./authSessionUpgrade";
import styles from "./Auth.module.css";
import { useSeizeConnectContext } from "./SeizeConnectContext";

const SIGN_IN_CLASSES = {
  signModalSurface:
    "tw-overflow-hidden tw-rounded-xl tw-border tw-border-solid tw-border-white/10 tw-bg-iron-950 tw-text-iron-100 tw-shadow-2xl",
  signModalHeader:
    "tw-flex tw-items-center tw-justify-between tw-gap-3 tw-px-5 tw-pb-0 tw-pt-5",
  signModalTitle:
    "tw-m-0 tw-text-xl tw-font-semibold tw-leading-7 tw-text-iron-50",
  signModalBody: "tw-px-5 tw-pb-5 tw-pt-3",
  signModalLead: "tw-m-0 tw-text-sm tw-leading-6 tw-text-iron-300",
  signModalFooter:
    "tw-flex tw-flex-wrap tw-justify-end tw-gap-3 tw-px-5 tw-pb-5",
};

export function AuthSignModal({
  enableWalletAuthentication,
  isConnectionShareUpgradePrompt,
  isDisconnectedWebSessionUpgradePrompt,
  isSessionUpgradePrompt,
  isSigningPending,
  isSignRequestInProgress,
  onCancelSignRequest,
  onConfirmSignRequest,
  onSessionUpgradeLearnMore,
  sessionUpgradeCanDismiss,
  sessionUpgradeHasDeadline,
  sessionUpgradeTimeLeftMs,
  shouldShowSignModal,
}: {
  readonly enableWalletAuthentication: boolean;
  readonly isConnectionShareUpgradePrompt: boolean;
  readonly isDisconnectedWebSessionUpgradePrompt: boolean;
  readonly isSessionUpgradePrompt: boolean;
  readonly isSigningPending: boolean;
  readonly isSignRequestInProgress: boolean;
  readonly onCancelSignRequest: () => void;
  readonly onConfirmSignRequest: () => void;
  readonly onSessionUpgradeLearnMore: (
    event: MouseEvent<HTMLAnchorElement>
  ) => void;
  readonly sessionUpgradeCanDismiss: boolean;
  readonly sessionUpgradeHasDeadline: boolean;
  readonly sessionUpgradeTimeLeftMs: number;
  readonly shouldShowSignModal: boolean;
}) {
  const locale = useBrowserLocale();
  const modalStyles = isSessionUpgradePrompt ? styles : SIGN_IN_CLASSES;
  const { address } = useSeizeConnectContext();
  const sessionUpgradeTimeLeftText = useMemo(
    () => formatSessionUpgradeTimeLeft(sessionUpgradeTimeLeftMs, locale),
    [sessionUpgradeTimeLeftMs, locale]
  );
  const signModalTitle = (() => {
    if (isConnectionShareUpgradePrompt) {
      return t(locale, "auth.signModal.connectionUpdateRequired");
    }
    if (isSessionUpgradePrompt) {
      return t(locale, "auth.signModal.upgradeAuthentication");
    }
    return t(locale, "auth.signModal.authenticationRequest");
  })();
  const signModalLead = (() => {
    if (isConnectionShareUpgradePrompt) {
      return t(locale, "auth.signModal.connectionShareLead");
    }
    if (isSessionUpgradePrompt) {
      return t(locale, "auth.signModal.sessionUpgradeLead");
    }
    return t(locale, "auth.signModal.authLead");
  })();
  const signModalPrimaryListItem = (() => {
    if (isConnectionShareUpgradePrompt) {
      return t(locale, "auth.signModal.connectionSharePrimary");
    }
    if (isDisconnectedWebSessionUpgradePrompt) {
      return t(locale, "auth.signModal.disconnectedUpgradePrimary");
    }
    if (isSessionUpgradePrompt) {
      return t(locale, "auth.signModal.sessionUpgradePrimary");
    }
    return t(locale, "auth.signModal.authPrimary");
  })();
  const signModalSharedConnectionListItem = t(
    locale,
    "auth.signModal.sharedConnection"
  );
  const signModalSecondaryListItem = (() => {
    if (!isSessionUpgradePrompt) {
      return t(locale, "auth.signModal.noGas");
    }

    if (!sessionUpgradeHasDeadline) {
      return t(locale, "auth.signModal.manualUpgrade");
    }

    return t(locale, "auth.signModal.timeLeft", {
      timeLeft: sessionUpgradeTimeLeftText,
    });
  })();
  const signModalConfirmText = isDisconnectedWebSessionUpgradePrompt
    ? t(locale, "auth.signModal.connect")
    : t(locale, "auth.signModal.sign");
  const canDismissSignModal =
    !isSessionUpgradePrompt || sessionUpgradeCanDismiss;

  if (!enableWalletAuthentication || !shouldShowSignModal) {
    return null;
  }

  return (
    <ConfirmModalShell
      show
      title={signModalTitle}
      overlayClassName={AUTHENTICATION_MODAL_OVERLAY_CLASS}
      dialogClassName={`${styles["signModalDialog"]} ${modalStyles["signModalSurface"]}`}
      headerClassName={modalStyles["signModalHeader"]}
      titleClassName={modalStyles["signModalTitle"]}
      bodyClassName={modalStyles["signModalBody"]}
      footerClassName={modalStyles["signModalFooter"]}
      onBackdropClick={canDismissSignModal ? onCancelSignRequest : undefined}
      footer={
        <>
          {canDismissSignModal && (
            <Button
              type="button"
              onClick={onCancelSignRequest}
              variant="secondary"
              size="md"
              className="tw-min-w-32 max-[576px]:tw-min-w-0 max-[576px]:tw-flex-1"
            >
              {isSessionUpgradePrompt && sessionUpgradeHasDeadline
                ? t(locale, "auth.signModal.remindLater")
                : t(locale, "auth.signModal.cancel")}
            </Button>
          )}
          <output className="tw-sr-only">
            {isSigningPending
              ? t(locale, "auth.signModal.confirmInWallet")
              : ""}
          </output>
          {!isConnectionShareUpgradePrompt && (
            <Button
              type="button"
              data-auth-sign-primary
              onClick={onConfirmSignRequest}
              disabled={isSignRequestInProgress}
              aria-busy={isSignRequestInProgress}
              aria-label={
                isSigningPending
                  ? t(locale, "auth.signModal.confirmInWallet")
                  : signModalConfirmText
              }
              variant="action"
              size="lg"
              className="tw-min-w-32 max-[576px]:tw-min-w-0 max-[576px]:tw-flex-1"
            >
              {isSigningPending ? (
                <span className={styles["signModalButtonContent"]}>
                  {t(locale, "auth.signModal.confirmInWallet")} <DotLoader />
                </span>
              ) : (
                signModalConfirmText
              )}
            </Button>
          )}
        </>
      }
    >
      <p className={styles["signModalLead"]}>{signModalLead}</p>

      {isSessionUpgradePrompt ? (
        <ul className={styles["signModalList"]}>
          <li>{signModalPrimaryListItem}</li>
          {isDisconnectedWebSessionUpgradePrompt && (
            <li>{signModalSharedConnectionListItem}</li>
          )}
          <li>{signModalSecondaryListItem}</li>
        </ul>
      ) : (
        <>
          {address && (
            <div className="tw-mt-5 tw-flex tw-items-center tw-gap-3 tw-rounded-lg tw-border tw-border-solid tw-border-white/10 tw-bg-white/[0.03] tw-p-3">
              <WalletIcon
                className="tw-size-5 tw-shrink-0 tw-text-iron-400"
                aria-hidden="true"
              />
              <div className="tw-min-w-0">
                <span className="tw-block tw-text-xs tw-text-iron-400">
                  {t(locale, "auth.signModal.walletAddress")}
                </span>
                <span className="tw-break-all tw-font-mono tw-text-sm tw-text-iron-100">
                  {address}
                </span>
              </div>
            </div>
          )}
          <p className="tw-mb-0 tw-mt-4 tw-text-sm tw-leading-6 tw-text-iron-400">
            {t(locale, "auth.signModal.noTransaction")}
          </p>
        </>
      )}
      {isSessionUpgradePrompt && (
        <p className={styles["signModalLearnMore"]}>
          <Link
            href="/about/tech/wallet-authentication"
            onClick={onSessionUpgradeLearnMore}
          >
            {t(locale, "auth.signModal.learnMore")}
          </Link>
        </p>
      )}
    </ConfirmModalShell>
  );
}
