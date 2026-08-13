interface OpenDesktopAddConnectorChooserParams {
  readonly clearAddCandidate: () => void;
  readonly openChooser: () => void;
  readonly setAddingConnectedAccount: (isAdding: boolean) => void;
}

interface ShouldReconcileConnectorStateParams {
  readonly isBrowserConnectorHandoff: boolean;
  readonly isConnectorChooserOpen: boolean;
  readonly isSigningOutAll: boolean;
}

/** Opens Add without allowing existing connector state to become a candidate. */
export function openDesktopAddConnectorChooser({
  clearAddCandidate,
  openChooser,
  setAddingConnectedAccount,
}: OpenDesktopAddConnectorChooserParams): void {
  clearAddCandidate();
  setAddingConnectedAccount(false);
  openChooser();
}

/** Connector state must remain passive while the user is choosing a wallet. */
export function shouldReconcileConnectorState({
  isBrowserConnectorHandoff,
  isConnectorChooserOpen,
  isSigningOutAll,
}: ShouldReconcileConnectorStateParams): boolean {
  return !(
    isSigningOutAll ||
    isBrowserConnectorHandoff ||
    isConnectorChooserOpen
  );
}
