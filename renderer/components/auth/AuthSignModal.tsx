"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { MouseEvent } from "react";
import { ConfirmModalShell } from "@/components/shared/ConfirmModalShell";
import { AUTHENTICATION_MODAL_OVERLAY_CLASS } from "@/components/shared/modal-layers";
import { t } from "@/i18n/messages";
import DotLoader from "../dotLoader/DotLoader";
import {
  AUTH_MODAL_LOCALE,
  formatSessionUpgradeTimeLeft,
} from "./authSessionUpgrade";
import styles from "./Auth.module.css";

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
  const sessionUpgradeTimeLeftText = useMemo(
    () => formatSessionUpgradeTimeLeft(sessionUpgradeTimeLeftMs),
    [sessionUpgradeTimeLeftMs]
  );
  const signModalTitle = (() => {
    if (isConnectionShareUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.connectionUpdateRequired");
    }
    if (isSessionUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.upgradeAuthentication");
    }
    return t(AUTH_MODAL_LOCALE, "auth.signModal.authenticationRequest");
  })();
  const signModalLead = (() => {
    if (isConnectionShareUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.connectionShareLead");
    }
    if (isSessionUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.sessionUpgradeLead");
    }
    return t(AUTH_MODAL_LOCALE, "auth.signModal.authLead");
  })();
  const signModalPrimaryListItem = (() => {
    if (isConnectionShareUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.connectionSharePrimary");
    }
    if (isDisconnectedWebSessionUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.disconnectedUpgradePrimary");
    }
    if (isSessionUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.sessionUpgradePrimary");
    }
    return t(AUTH_MODAL_LOCALE, "auth.signModal.authPrimary");
  })();
  const signModalSharedConnectionListItem = t(
    AUTH_MODAL_LOCALE,
    "auth.signModal.sharedConnection"
  );
  const signModalSecondaryListItem = (() => {
    if (!isSessionUpgradePrompt) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.noGas");
    }

    if (!sessionUpgradeHasDeadline) {
      return t(AUTH_MODAL_LOCALE, "auth.signModal.manualUpgrade");
    }

    return t(AUTH_MODAL_LOCALE, "auth.signModal.timeLeft", {
      timeLeft: sessionUpgradeTimeLeftText,
    });
  })();
  const signModalConfirmText = isDisconnectedWebSessionUpgradePrompt
    ? t(AUTH_MODAL_LOCALE, "auth.signModal.connect")
    : t(AUTH_MODAL_LOCALE, "auth.signModal.sign");
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
      dialogClassName={`${styles["signModalDialog"]} ${styles["signModalSurface"]}`}
      headerClassName={styles["signModalHeader"]}
      titleClassName={styles["signModalTitle"]}
      bodyClassName={styles["signModalBody"]}
      footerClassName={styles["signModalFooter"]}
      onBackdropClick={canDismissSignModal ? onCancelSignRequest : undefined}
      footer={
        <>
          {canDismissSignModal && (
            <button
              type="button"
              className={styles["signModalCancelButton"]}
              onClick={onCancelSignRequest}
            >
              {isSessionUpgradePrompt && sessionUpgradeHasDeadline
                ? t(AUTH_MODAL_LOCALE, "auth.signModal.remindLater")
                : t(AUTH_MODAL_LOCALE, "auth.signModal.cancel")}
            </button>
          )}
          {!isConnectionShareUpgradePrompt && (
            <button
              type="button"
              className={styles["signModalConfirmButton"]}
              data-auth-sign-primary
              onClick={onConfirmSignRequest}
              disabled={isSignRequestInProgress}
            >
              {isSigningPending ? (
                <span className={styles["signModalButtonContent"]}>
                  {t(AUTH_MODAL_LOCALE, "auth.signModal.confirmInWallet")}{" "}
                  <DotLoader />
                </span>
              ) : (
                signModalConfirmText
              )}
            </button>
          )}
        </>
      }
    >
      <p className={styles["signModalLead"]}>{signModalLead}</p>

      <ul className={styles["signModalList"]}>
        <li>{signModalPrimaryListItem}</li>
        {isDisconnectedWebSessionUpgradePrompt && (
          <li>{signModalSharedConnectionListItem}</li>
        )}
        <li>{signModalSecondaryListItem}</li>
      </ul>
      {isSessionUpgradePrompt && (
        <p className={styles["signModalLearnMore"]}>
          <Link
            href="/about/tech/wallet-authentication"
            onClick={onSessionUpgradeLearnMore}
          >
            {t(AUTH_MODAL_LOCALE, "auth.signModal.learnMore")}
          </Link>
        </p>
      )}
    </ConfirmModalShell>
  );
}
