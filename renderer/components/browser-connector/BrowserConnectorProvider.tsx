"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";
import { hexToString } from "viem";
import { useChainId, useSendTransaction, useSignMessage } from "wagmi";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import styles from "./BrowserConnector.module.scss";
import BrowserConnectorWalletIntentNotice, {
  type BrowserConnectorWalletIntentNoticeType,
} from "./BrowserConnectorWalletIntentNotice";
import { normalizeBrowserConnectorAddress } from "./browserConnector.helpers";

export default function BrowserConnectorProvider(
  props: Readonly<{
    returnScheme: string;
    setCompleted: (value: boolean) => void;
  }>
) {
  const searchParams = useSearchParams();
  const searchParamsSnapshot = searchParams?.toString() ?? "";
  const requestParams = useMemo(
    () => new URLSearchParams(searchParamsSnapshot),
    [searchParamsSnapshot]
  );
  const account = useSeizeConnectContext();
  const chainId = useChainId();
  const [methodParams, setMethodParams] = useState<any>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requesterAddress, setRequesterAddress] = useState<string | null>(null);

  const [missingInfo, setMissingInfo] = useState(false);

  const [redirectCountdown, setRedirectCountdown] = useState(3);

  const {
    signMessage,
    data: signMessageData,
    error: signMessageError,
  } = useSignMessage();
  const {
    sendTransaction,
    data: sendTransactionData,
    error: sendTransactionError,
  } = useSendTransaction();

  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const intendedWalletAddress = useMemo(
    () =>
      normalizeBrowserConnectorAddress(
        requestParams.get("intendedWalletAddress")
      ),
    [requestParams]
  );
  const normalizedConnectedAddress = normalizeBrowserConnectorAddress(
    account.address
  );
  const normalizedRequesterAddress =
    normalizeBrowserConnectorAddress(requesterAddress);
  const expectedSignerAddress =
    intendedWalletAddress ?? normalizedRequesterAddress;
  const hasRequesterMismatch =
    !!intendedWalletAddress &&
    !!normalizedRequesterAddress &&
    intendedWalletAddress !== normalizedRequesterAddress;
  const walletIntentNotice =
    useMemo<BrowserConnectorWalletIntentNoticeType | null>(() => {
      if (!expectedSignerAddress || hasRequesterMismatch) {
        return null;
      }
      if (normalizedConnectedAddress === expectedSignerAddress) {
        return null;
      }
      return {
        type: normalizedConnectedAddress ? "switch-requested" : "connect-requested",
        address: expectedSignerAddress,
      };
    }, [
      expectedSignerAddress,
      hasRequesterMismatch,
      normalizedConnectedAddress,
    ]);
  const canSignProviderRequest =
    !!expectedSignerAddress &&
    !hasRequesterMismatch &&
    normalizedConnectedAddress === expectedSignerAddress;

  useEffect(() => {
    const method = requestParams.get("method");
    const encodedParams = requestParams.get("params");
    const rId = requestParams.get("requestId");
    if (!method || !encodedParams || !rId) {
      setMissingInfo(true);
      setMethodParams(null);
      setRequestId(null);
      setRequesterAddress(null);
      return;
    }

    let params: any;
    try {
      params = JSON.parse(decodeURIComponent(encodedParams));
    } catch {
      setMissingInfo(true);
      setMethodParams(null);
      setRequestId(null);
      setRequesterAddress(null);
      return;
    }

    setMissingInfo(false);
    setMethodParams({ method, params });
    setRequestId(rId);

    let requester: string | null = null;
    switch (method) {
      case "personal_sign": {
        requester = typeof params?.[1] === "string" ? params[1] : null;
        break;
      }
      case "eth_sendTransaction": {
        requester =
          typeof params?.[0]?.from === "string" ? params[0].from : null;
        break;
      }
    }
    setRequesterAddress(requester);
  }, [requestParams]);

  function startRedirectCountdown(d: any) {
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => prev - 1);
    }, 1000);
    setTimeout(() => {
      clearInterval(interval);
      openApp(d);
    }, 3000);
  }

  useEffect(() => {
    const d = signMessageData ?? sendTransactionData;
    if (!d) return;
    setIsSuccess(true);
    startRedirectCountdown(d);
  }, [signMessageData, sendTransactionData]);

  useEffect(() => {
    const e = signMessageError ?? sendTransactionError;
    if (!e) return;

    const eMsg =
      e.message
        ?.split("Request Arguments")[0]
        ?.split(".")[0]
        ?.split("Contract Call")[0] ?? "Unknown error";
    setError(eMsg ?? "");
  }, [signMessageError, sendTransactionError]);

  async function onSign() {
    setError(null);
    const { method, params } = methodParams;
    switch (method) {
      case "personal_sign": {
        const msg = hexToString(params[0]);
        signMessage({ message: msg });
        break;
      }
      case "eth_sendTransaction": {
        const sendParams: any = {
          to: params[0].to,
          data: params[0].data,
        };
        if (params[0].value) {
          sendParams.value = params[0].value;
        }
        sendTransaction({ ...sendParams, chainId: chainId });
        break;
      }
      default:
        setError(`Unsupported method: ${method}`);
    }
  }

  async function onCancel() {
    setIsCancelled(true);
    const d = {
      error: "Cancelled",
    };
    startRedirectCountdown(d);
  }

  async function openApp(d: any) {
    const serializedInfo = JSON.stringify({
      requestId,
      data: d,
    });
    const deepLink = `${props.returnScheme}://connector?data=${encodeURIComponent(
      serializedInfo
    )}`;
    window.location.href = deepLink;
    props.setCompleted(true);
  }

  if (missingInfo) {
    return (
      <Container>
        <Row>
          <Col>
            <p>Error: Missing required information to process this transaction.</p>
            <p>Close this window, return to 6529 Desktop and retry.</p>
          </Col>
        </Row>
      </Container>
    );
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
          <span>Sign Transaction</span>
        </Col>
        <Col xs={12} className="pt-3">
          <Container>
            <Row>
              <Col xs={12}>Connected Address</Col>
              <Col xs={12}>
                <code>{account.address?.toLowerCase()}</code>
              </Col>
            </Row>
            <Row className="pt-2">
              <Col xs={12}>Method</Col>
              <Col xs={12}>
                <code>{methodParams?.method}</code>
              </Col>
            </Row>
            <Row>
              {methodParams && (
                <Col>
                  {canSignProviderRequest ? (
                    <div className="tw-flex tw-gap-3">
                      {!isCancelled && (
                        <button
                          onClick={onSign}
                          className="mt-3 tw-inline-flex tw-w-32 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                        >
                          {isSuccess ? "Signed" : "Sign"}
                        </button>
                      )}

                      {!isSuccess && (
                        <button
                          onClick={onCancel}
                          className="mt-3 bg-danger tw-inline-flex tw-w-32 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                        >
                          {isCancelled ? "Cancelled" : "Cancel"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="pt-3 text-danger">
                      {hasRequesterMismatch ? (
                        <>
                          This request does not match the expected wallet:
                          <br />
                          <code className="text-danger">
                            {intendedWalletAddress}
                          </code>
                        </>
                      ) : walletIntentNotice ? (
                        <BrowserConnectorWalletIntentNotice
                          notice={walletIntentNotice}
                        />
                      ) : requesterAddress ? (
                        <>
                          This request is for address:
                          <br />
                          <code className="text-danger">
                            {requesterAddress.toLowerCase()}
                          </code>
                        </>
                      ) : (
                        <>Requester Address Missing</>
                      )}
                    </div>
                  )}
                </Col>
              )}
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
