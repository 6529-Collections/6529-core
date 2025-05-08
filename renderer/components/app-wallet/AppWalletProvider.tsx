import styles from "./AppWallet.module.scss";
import { useEffect, useState } from "react";
import { useChainId, useSendTransaction, useSignMessage } from "wagmi";
import { Container, Row, Col } from "react-bootstrap";
import { hexToString } from "viem";
import { areEqualAddresses } from "../../helpers/Helpers";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";

export default function AppWalletProvider(
  props: Readonly<{
    scheme?: string;
    setCompleted: (value: boolean) => void;
  }>
) {
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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const method = urlParams.get("method");
    const params = JSON.parse(
      decodeURIComponent(urlParams.get("params") ?? "[]")
    );
    const rId = urlParams.get("requestId");
    if (!method || !params || !rId) {
      setMissingInfo(true);
    } else {
      setMethodParams({ method, params });
      setRequestId(rId);
    }

    let requester = null;
    switch (method) {
      case "personal_sign": {
        requester = params[1];
        break;
      }
      case "eth_sendTransaction": {
        requester = params[0].from;
        break;
      }
    }
    setRequesterAddress(requester);
  }, []);

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

    const eMsg = e.message
      .split("Request Arguments")[0]
      .split(".")[0]
      .split("Contract Call")[0];
    setError(eMsg);
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

  async function openApp(d: any) {
    const serializedInfo = JSON.stringify({
      requestId,
      data: d,
    });
    const deepLink = `${props.scheme}://connector?data=${encodeURIComponent(
      serializedInfo
    )}`;
    window.location.href = deepLink;
    props.setCompleted(true);
  }

  if (!account.isConnected || missingInfo) {
    let errorMessage = missingInfo
      ? "Missing required information to process this transaction."
      : "The account is not connected.";
    return (
      <Container>
        <Row>
          <Col>
            <p>Error: {errorMessage}</p>
            <p>Close this window, return to 6529 CORE and retry.</p>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container>
      <Row className={`pb-3 ${isSuccess ? styles.disabled : ""}`}>
        <Col xs={12}>
          <span className={styles.circledNumber}>1</span>
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
                  {areEqualAddresses(account.address, requesterAddress) ? (
                    <button
                      onClick={onSign}
                      className="mt-3 tw-whitespace-nowrap tw-inline-flex tw-items-center tw-cursor-pointer tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-leading-6 tw-rounded-lg tw-font-semibold tw-text-white tw-border-0 tw-ring-1 tw-ring-inset tw-ring-primary-500 hover:tw-ring-primary-600 placeholder:tw-text-iron-300 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset tw-shadow-sm hover:tw-bg-primary-600 tw-transition tw-duration-300 tw-ease-out">
                      {isSuccess ? "Signed" : "Sign"}
                    </button>
                  ) : (
                    <div className="pt-3 text-danger">
                      Something is wrong...{" "}
                      {requesterAddress ? (
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
      <Row className={`pt-3 ${!isSuccess ? styles.disabled : ""}`}>
        <Col xs={12}>
          <span className={styles.circledNumber}>2</span>
          <span>Return to 6529 CORE</span>
        </Col>
        <Col xs={12} className="pt-3">
          {isSuccess &&
            (redirectCountdown > 0 ? (
              <Container>
                <Row>
                  <Col>You will be redirected in {redirectCountdown}</Col>
                </Row>
              </Container>
            ) : (
              <Container>
                <Row>
                  <Col>Redirected to 6529 CORE</Col>
                </Row>
              </Container>
            ))}
        </Col>
      </Row>
    </Container>
  );
}
