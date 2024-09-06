import { useEffect, useRef, useState } from "react";
import styles from "./Confirm.module.scss";
import { Modal, Button } from "react-bootstrap";
import { SeedWalletRequest } from "../../../shared/types";
import { hexToString } from "../../helpers";
import { fromGWEI, isValidEthAddress } from "../../helpers/Helpers";
import { useToast } from "../../contexts/ToastContext";
import { useAccount, useBalance, useChainId } from "wagmi";
import { sepolia } from "viem/chains";
import { useSeedWallet } from "../../contexts/SeedWalletContext";
import { ethers } from "ethers";

function parseTransactionData(data: string) {
  const functionSelector = data.slice(0, 10);

  const args = data.slice(10);

  const argChunks = args.match(/.{1,64}/g);

  if (!argChunks) {
    console.log("No arguments found");
    return;
  }

  const decodedArgs = argChunks.map((chunk, index) => {
    const paddedValue = chunk.padStart(64, "0");

    if (index === 0 || index === 1) {
      return `0x${paddedValue.slice(24)}`;
    } else if (index === 2) {
      return BigInt(`0x${paddedValue}`).toString();
    } else {
      return `0x${paddedValue}` ===
        "0x0000000000000000000000000000000000000000000000000000000000000001"
        ? "true"
        : "false";
    }
  });

  return {
    selector: functionSelector,
    args: decodedArgs,
  };
}

export default function ConfirmSeedWalletRequest() {
  const [show, setShow] = useState(false);

  const seedWalletContext = useSeedWallet();

  const account = useAccount();
  const chainId = useChainId();
  const balance = useBalance({
    address: account.address,
    chainId: chainId,
  });

  const { showToast } = useToast();

  const [showParsed, setShowParsed] = useState(false);
  const [seedRequest, setSeedRequest] = useState<SeedWalletRequest>();

  const hasMounted = useRef(false);

  const clear = () => {
    setSeedRequest(undefined);
    setShow(false);
  };

  const onReject = (request: SeedWalletRequest) => {
    window.seedConnector.reject(request);
    clear();
  };

  const onConfirm = (request: SeedWalletRequest) => {
    window.seedConnector.confirm(request);
    clear();
  };

  const requestHandler = (
    wallet: ethers.Wallet,
    request: SeedWalletRequest
  ) => {
    setSeedRequest({
      ...request,
      privateKey: wallet.privateKey,
    });
    balance.refetch();
    setShow(true);
  };

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    const handleRequest = (_event: any, request: SeedWalletRequest) => {
      seedWalletContext.handleRequest(requestHandler, request);
    };

    const handleToast = (
      _event: any,
      toast: { type: "success" | "error"; message: string }
    ) => {
      showToast(toast.message, toast.type, true);
    };

    window.seedConnector?.onInitRequest(handleRequest);
    window.seedConnector?.onShowToast(handleToast);

    return () => {
      window.seedConnector?.offInitRequest(handleRequest);
      window.seedConnector?.offShowToast(handleToast);
    };
  }, [seedWalletContext.isSeedWallet]);

  function getHtml(index: number, param: string) {
    let content = "";
    if (isValidEthAddress(param)) {
      content = param;
    } else {
      const parsed = hexToString(param).replace(/^\n+/, "");
      content = parsed.replaceAll("\n", "<br>");
    }

    return `${index + 1}: ${content}`;
  }

  function printParams(request: SeedWalletRequest) {
    if (request.method === "personal_sign") {
      return (
        <>
          <span>Parameters</span>
          {seedRequest?.params?.map((param, index) => (
            <code
              key={param}
              className="pt-3 pb-3"
              dangerouslySetInnerHTML={{
                __html: getHtml(index, param),
              }}></code>
          ))}
        </>
      );
    } else if (request.method === "eth_sendTransaction") {
      const param = seedRequest?.params[0];
      const parsedData = parseTransactionData(param.data);
      return (
        <>
          <span className="pt-3">From</span>
          <code className="pb-3">{param.from}</code>
          <span className="pt-3">To</span>
          <code className="pb-3">{param.to}</code>
          {param.value && (
            <>
              <span className="pt-3">Value</span>
              <code className="pb-3">{param.value}</code>
            </>
          )}
          <span className="pt-3 d-flex align-items-center justify-content-between">
            <span>Data</span>
            <Button
              variant="secondary"
              style={{
                width: "fit-content",
                fontSize: "smaller",
              }}
              onClick={() => setShowParsed(!showParsed)}>
              {showParsed ? "Hide" : "Show"} Parsed Data
            </Button>
          </span>
          {showParsed ? (
            <>
              <span className="pt-3">Function Selector</span>
              <code className="pb-1">{parsedData?.selector}</code>
              <span className="pt-1 pb-1">Arguments</span>
              {parsedData?.args.map((arg, index) => (
                <code key={arg} className="pb-1">
                  {index + 1}. {arg}
                </code>
              ))}
            </>
          ) : (
            <code className="pt-3 pb-3 text-break">{param.data}</code>
          )}
        </>
      );
    } else {
      return seedRequest?.params?.map((param, index) => (
        <code key={index} className="pt-3 pb-3">
          {JSON.stringify(param)}
        </code>
      ));
    }
  }

  if (!seedRequest) {
    return <></>;
  }

  return (
    <Modal show={show} backdrop="static" keyboard={false} centered>
      <Modal.Header className={styles.modalHeader}>
        <Modal.Title>Confirm Seed Wallet Request</Modal.Title>
      </Modal.Header>
      <Modal.Body
        className={`${styles.modalContent} ${styles.modalContentSeedRequest}`}>
        <div className="mt-2 mb-2">
          <span className="d-flex flex-column">
            <span>Method</span>
            <code>{seedRequest?.method}</code>
          </span>
          <span className="pt-3 d-flex flex-column">
            {printParams(seedRequest)}
          </span>
        </div>
      </Modal.Body>
      <Modal.Footer
        className={`${styles.modalContent} d-flex align-items-center justify-content-between`}>
        <span>
          {balance.data && (
            <>
              {fromGWEI(Number(balance.data.value)).toLocaleString()}{" "}
              {balance.data?.symbol}
              {chainId === sepolia.id && (
                <span className="font-color-h"> (sepolia)</span>
              )}
            </>
          )}
        </span>
        <span className="d-flex gap-2">
          <Button variant="danger" onClick={() => onReject(seedRequest)}>
            Reject
          </Button>
          <Button variant="primary" onClick={() => onConfirm(seedRequest)}>
            Confirm
          </Button>
        </span>
      </Modal.Footer>
    </Modal>
  );
}
