export default function HeaderQRScanner({
  onScanSuccess: _onScanSuccess,
  appSidebar: _appSidebar = false,
  actionLabel: _actionLabel,
  deviceSetupAddress: _deviceSetupAddress,
}: {
  readonly onScanSuccess?: () => void;
  readonly actionLabel?: string;
  readonly deviceSetupAddress?: string | undefined;
  readonly appSidebar?: boolean | undefined;
}) {
  return <></>;
}
