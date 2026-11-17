"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  useAccount,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
} from "wagmi";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import styles from "./BrowserConnector.module.css";
import BrowserConnectorWalletIntentNotice, {
  type BrowserConnectorWalletIntentNoticeType,
} from "./BrowserConnectorWalletIntentNotice";
import {
  parseTypedDataRequest,
  SIGN_TYPED_DATA_V4,
} from "@/wagmiConfig/typedDataRequest";
import { normalizeBrowserConnectorAddress } from "./browserConnector.helpers";
import {
  browserWalletChainName,
  buildBrowserWalletReturnLink,
  describeBrowserWalletRefusal,
  describeBrowserWalletRequest,
  fetchBrowserWalletRequest,
  readBrowserWalletRequestId,
  type BrowserWalletClaimResponse,
  type BrowserWalletPageOutcome,
  type BrowserWalletRefusal,
} from "./browserWalletRequest.helpers";
import { assertTypedDataRoot } from "@/wagmiConfig/typedDataRoot";

const bootstrapUtilityClasses: Record<string, string> = {
  "pt-2": "tw-pt-2",
  "pt-3": "tw-pt-3",
  "pt-4": "tw-pt-4",
  "pb-3": "tw-pb-3",
  "text-danger": "tw-text-red",
  "bg-danger": "tw-bg-red",
};

/** Translate the legacy connector layout utilities into scoped Tailwind names. */
function mapUtilityClasses(className = ""): string {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .map(
      (classNamePart) => bootstrapUtilityClasses[classNamePart] ?? classNamePart
    )
    .join(" ");
}

function Container({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
}) {
  return <div className={mapUtilityClasses(className)}>{children}</div>;
}

function Row({
  children,
  className,
  style,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}) {
  return (
    <div
      className={`tw-flex tw-flex-wrap ${mapUtilityClasses(className)}`}
      style={style}
    >
      {children}
    </div>
  );
}

function Col({
  children,
  className,
  xs,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly xs?: number | undefined;
}) {
  return (
    <div
      className={`${xs === 12 ? "tw-w-full" : "tw-flex-1"} ${mapUtilityClasses(className)}`}
    >
      {children}
    </div>
  );
}

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "refused"; readonly refusal: BrowserWalletRefusal }
  | {
      readonly status: "ready";
      readonly id: string;
      readonly claim: BrowserWalletClaimResponse;
      readonly expiresAt: number;
    };

/** True when the wallet reported that the user declined the request. */
function isUserRejection(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const candidate = current as {
      code?: unknown;
      name?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === 4001 ||
      candidate.name === "UserRejectedRequestError"
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

const BUTTON_CLASS =
  "tw-mt-3 tw-inline-flex tw-w-32 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset";
const PRIMARY_BUTTON_CLASS = `${BUTTON_CLASS} tw-bg-primary-500 tw-ring-primary-500 hover:tw-bg-primary-600 hover:tw-ring-primary-600`;
const CANCEL_BUTTON_CLASS = `${BUTTON_CLASS} tw-bg-red tw-ring-red hover:tw-bg-red/80 hover:tw-ring-red/80`;

function RefusedRequest({ message }: { readonly message: string }) {
  return (
    <Container>
      <Row>
        <Col>
          <p role="status">{message}</p>
          <p>
            Nothing will be signed. Close this window and retry from 6529
            Desktop.
          </p>
        </Col>
      </Row>
    </Container>
  );
}

/**
 * Runs one wallet request that 6529 Desktop issued. The request is read from
 * the app's own server by the one-time id in the URL fragment; the page shows
 * what will be signed or sent, requires the bound wallet and network, and
 * returns the result to the app once.
 */
export default function BrowserConnectorProvider(
  props: Readonly<{
    returnScheme: string;
    setCompleted: (value: boolean) => void;
  }>
) {
  const account = useSeizeConnectContext();
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [isExpired, setIsExpired] = useState(false);

  const [redirectCountdown, setRedirectCountdown] = useState(3);

  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();
  const [isSigning, setIsSigning] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const signingInFlightRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const responseStartedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const id = readBrowserWalletRequestId(window.location.hash);
    if (!id) {
      setLoad({ status: "refused", refusal: "missing" });
      return;
    }
    fetchBrowserWalletRequest(id).then((result) => {
      if (!active) return;
      setLoad(
        result.ok
          ? {
              status: "ready",
              id,
              claim: result.claim,
              expiresAt: Date.now() + result.claim.expiresInMs,
            }
          : { status: "refused", refusal: result.refusal }
      );
    });
    return () => {
      active = false;
    };
  }, []);

  const expiresAt = load.status === "ready" ? load.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = setTimeout(
      () => setIsExpired(true),
      Math.max(0, expiresAt - Date.now())
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const request = load.status === "ready" ? load.claim.request : null;
  const description = useMemo(
    () => (request ? describeBrowserWalletRequest(request) : null),
    [request]
  );
  const expectedSignerAddress = request?.address ?? null;
  const normalizedConnectedAddress = normalizeBrowserConnectorAddress(
    account.address
  );
  const walletIntentNotice =
    useMemo<BrowserConnectorWalletIntentNoticeType | null>(() => {
      if (!expectedSignerAddress) return null;
      if (normalizedConnectedAddress === expectedSignerAddress) return null;
      return {
        type: normalizedConnectedAddress
          ? "switch-requested"
          : "connect-requested",
        address: expectedSignerAddress,
      };
    }, [expectedSignerAddress, normalizedConnectedAddress]);
  const requiredChainId = description?.requiredChainId ?? null;
  const isWrongChain =
    requiredChainId !== null && walletChainId !== requiredChainId;
  const canSignProviderRequest =
    !!expectedSignerAddress &&
    normalizedConnectedAddress === expectedSignerAddress &&
    !isWrongChain &&
    !isExpired;

  function startRedirectCountdown(d: any) {
    // Cancellation wins over a signature that resolves later in the wallet.
    if (responseStartedRef.current) return false;
    responseStartedRef.current = true;
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => prev - 1);
    }, 1000);
    setTimeout(() => {
      clearInterval(interval);
      openApp(d);
    }, 3000);
    return true;
  }

  async function onSwitchChain() {
    if (requiredChainId === null || isSwitching) return;
    setIsSwitching(true);
    setError(null);
    try {
      await switchChainAsync({ chainId: requiredChainId });
    } catch {
      setError(
        `Switch your wallet to ${browserWalletChainName(requiredChainId)} to continue.`
      );
    } finally {
      setIsSwitching(false);
    }
  }

  /** One wallet request at a time; cancellation wins over any late result. */
  async function onSign() {
    if (
      responseStartedRef.current ||
      signingInFlightRef.current ||
      !canSignProviderRequest ||
      !request
    )
      return;
    signingInFlightRef.current = true;
    setIsSigning(true);
    setError(null);
    try {
      let result: string;
      switch (request.method) {
        case "personal_sign": {
          // Sign the exact bytes 6529 Desktop asked for.
          result = await signMessageAsync({
            account: request.address as `0x${string}`,
            message: { raw: request.message as `0x${string}` },
          });
          break;
        }
        case "eth_sendTransaction": {
          const { transaction } = request;
          result = await sendTransactionAsync({
            account: transaction.from as `0x${string}`,
            to: transaction.to as `0x${string}`,
            data: transaction.data as `0x${string}`,
            value: BigInt(transaction.value),
            // The wallet must be on the request's network, never another.
            chainId: request.chainId,
          });
          break;
        }
        case SIGN_TYPED_DATA_V4: {
          const typedData = parseTypedDataRequest([
            request.address,
            request.typedData,
          ]);
          assertTypedDataRoot(typedData);
          result = await signTypedDataAsync({
            account: typedData.address as `0x${string}`,
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
          break;
        }
      }
      if (startRedirectCountdown({ result })) setIsSuccess(true);
    } catch (signError: unknown) {
      if (!responseStartedRef.current) {
        if (isUserRejection(signError)) {
          setError("You declined the request in your wallet.");
        } else {
          const message =
            signError instanceof Error ? signError.message : "Unknown error";
          setError(
            message.split("Request Arguments")[0]?.split("Contract Call")[0] ??
              "Unknown error"
          );
        }
      }
    } finally {
      signingInFlightRef.current = false;
      setIsSigning(false);
    }
  }

  /** Return cancellation immediately without waiting for the external wallet. */
  async function onCancel() {
    const d: BrowserWalletPageOutcome = { error: "cancelled" };
    if (startRedirectCountdown(d)) setIsCancelled(true);
  }

  /** Return one correlated response through the approved desktop scheme. */
  async function openApp(d: BrowserWalletPageOutcome) {
    if (load.status !== "ready") return;
    window.location.href = buildBrowserWalletReturnLink(
      props.returnScheme,
      load.id,
      load.claim.returnToken,
      d
    );
    props.setCompleted(true);
  }

  if (load.status === "loading") {
    return (
      <Container>
        <Row>
          <Col>
            <p role="status">Loading the wallet request…</p>
          </Col>
        </Row>
      </Container>
    );
  }

  if (load.status === "refused") {
    return (
      <RefusedRequest message={describeBrowserWalletRefusal(load.refusal)} />
    );
  }

  if (isExpired && !isSuccess && !isCancelled) {
    return <RefusedRequest message={describeBrowserWalletRefusal("expired")} />;
  }

  if (!account.isConnected) {
    return (
      <Container>
        <Row>
          <Col>
            {walletIntentNotice ? (
              <BrowserConnectorWalletIntentNotice notice={walletIntentNotice} />
            ) : (
              <p>Error: The account is not connected.</p>
            )}
            <p>Close this window, return to 6529 Desktop and retry.</p>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container>
      <Row
        className={`pb-3 ${isSuccess || isCancelled ? styles["disabled"] : ""}`}
      >
        <Col xs={12}>
          <span className={styles["circledNumber"]}>1</span>
          <span>{description?.title}</span>
        </Col>
        <Col xs={12} className="pt-3">
          <Container>
            <Row>
              <Col xs={12}>Connected Address</Col>
              <Col xs={12}>
                <code>{account.address?.toLowerCase()}</code>
              </Col>
            </Row>
            {description?.rows.map((row, index) => (
              <Row className="pt-2" key={`${row.label}-${index}`}>
                <Col xs={12}>{row.label}</Col>
                <Col xs={12}>
                  {row.monospace ? (
                    <code className="tw-whitespace-pre-wrap tw-break-all">
                      {row.value}
                    </code>
                  ) : (
                    <span className="tw-whitespace-pre-wrap tw-break-words">
                      {row.value}
                    </span>
                  )}
                </Col>
              </Row>
            ))}
            {description?.warnings.map((warning) => (
              <Row className="pt-3" key={warning}>
                <Col xs={12} className="text-danger">
                  <span>
                    <strong>Warning:</strong> {warning}
                  </span>
                </Col>
              </Row>
            ))}
            <span role="status" className="tw-sr-only">
              {isSigning
                ? "Waiting for your wallet…"
                : isSwitching
                  ? "Switching network…"
                  : isSuccess
                    ? "Signed. Returning to 6529 Desktop."
                    : ""}
            </span>
            <Row>
              <Col>
                {canSignProviderRequest ? (
                  <div className="tw-flex tw-gap-3">
                    {!isCancelled && (
                      <button
                        onClick={onSign}
                        disabled={isSigning || isSuccess}
                        className={PRIMARY_BUTTON_CLASS}
                      >
                        {isSuccess
                          ? "Signed"
                          : isSigning
                            ? "Signing…"
                            : "Sign"}
                      </button>
                    )}

                    {!isSuccess && (
                      <button
                        onClick={onCancel}
                        className={CANCEL_BUTTON_CLASS}
                      >
                        {isCancelled ? "Cancelled" : "Cancel"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="tw-pt-3 tw-text-red">
                    {walletIntentNotice ? (
                      <BrowserConnectorWalletIntentNotice
                        notice={walletIntentNotice}
                      />
                    ) : isWrongChain && requiredChainId !== null ? (
                      <p role="status">
                        Your wallet is on another network. Switch it to{" "}
                        {browserWalletChainName(requiredChainId)} to continue.
                      </p>
                    ) : null}
                    <div className="tw-flex tw-gap-3">
                      {isWrongChain && !walletIntentNotice && (
                        <button
                          onClick={onSwitchChain}
                          disabled={isSwitching}
                          className={PRIMARY_BUTTON_CLASS}
                        >
                          {isSwitching ? "Switching…" : "Switch network"}
                        </button>
                      )}
                      {!isCancelled && (
                        <button
                          onClick={onCancel}
                          className={CANCEL_BUTTON_CLASS}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Col>
            </Row>
            {error && (
              <Row className="pt-3">
                <Col className="text-danger">{error}</Col>
              </Row>
            )}
          </Container>
        </Col>
      </Row>
      <hr />
      <Row
        className={`pt-3 ${!isSuccess && !isCancelled ? styles["disabled"] : ""}`}
      >
        <Col xs={12}>
          <span className={styles["circledNumber"]}>2</span>
          <span>Return to 6529 Desktop</span>
        </Col>
        <Col xs={12} className="pt-3">
          {(isSuccess || isCancelled) &&
            (redirectCountdown > 0 ? (
              <Container>
                <Row>
                  <Col>You will be redirected in {redirectCountdown}</Col>
                </Row>
              </Container>
            ) : (
              <Container>
                <Row>
                  <Col>Redirected to 6529 Desktop</Col>
                </Row>
              </Container>
            ))}
        </Col>
      </Row>
    </Container>
  );
}
