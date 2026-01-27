"use client";

import {
  ConfirmModalShell,
  confirmBtnDanger,
  confirmBtnPrimaryWithIcon,
  confirmBtnSecondarySmall,
  confirmModalFooterBetween,
} from "@/components/shared/ConfirmModalShell";
import { useModalState } from "@/contexts/ModalStateContext";
import { useSeedWallet } from "@/contexts/SeedWalletContext";
import { useToast } from "@/contexts/ToastContext";
import { hexToString } from "@/helpers";
import { fromGWEI, isValidEthAddress } from "@/helpers/Helpers";
import { SeedWalletRequest } from "@/shared/types";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ethers, formatUnits } from "ethers";
import { useEffect, useMemo, useRef, useState } from "react";
import { sepolia } from "viem/chains";
import { useBalance, useChainId } from "wagmi";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";

const SEED_WALLET_REQUEST_MODAL = "SeedWalletRequestModal";

function parseTransactionData(data: string) {
  if (!data) return undefined;
  const functionSelector = data.slice(0, 10);
  const args = data.slice(10);
  const argChunks = args.match(/.{1,64}/g);
  if (!argChunks) return undefined;
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
  return { selector: functionSelector, args: decodedArgs };
}

export default function ConfirmSeedWalletRequest() {
  const [show, setShow] = useState(false);
  const { isTopModal, addModal, removeModal } = useModalState();
  const seedWalletContext = useSeedWallet();
  const account = useSeizeConnectContext();
  const chainId = useChainId();
  const balance = useBalance({
    address: account.address as `0x${string}`,
    chainId: chainId,
  });
  const { showToast } = useToast();
  const [showParsed, setShowParsed] = useState(false);
  const [seedRequest, setSeedRequest] = useState<SeedWalletRequest>();
  const hasMounted = useRef(false);

  const hasEnoughBalance = useMemo(() => {
    if (!seedRequest?.params[0]?.value || !balance.data) return true;
    const paramValue = seedRequest.params[0]?.value;
    return balance.data.value >= BigInt(paramValue);
  }, [seedRequest, balance.data]);

  useEffect(() => {
    if (show) addModal(SEED_WALLET_REQUEST_MODAL);
    else removeModal(SEED_WALLET_REQUEST_MODAL);
    return () => removeModal(SEED_WALLET_REQUEST_MODAL);
  }, [show, addModal, removeModal]);

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
    wallet: ethers.Wallet | null,
    request: SeedWalletRequest
  ) => {
    setSeedRequest({
      ...request,
      privateKey: wallet?.privateKey ?? "",
    });
    balance.refetch();
    setShow(true);
  };

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    const handleRequest = (_event: unknown, request: SeedWalletRequest) => {
      seedWalletContext.handleRequest(requestHandler, request);
    };
    const handleToast = (
      _event: unknown,
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
  }, [seedWalletContext.isSeedWallet, showToast]);

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
          {request?.params?.map((param, index) => (
            <code
              key={param}
              className="tw-block tw-pt-3 tw-pb-3 tw-break-all"
              dangerouslySetInnerHTML={{ __html: getHtml(index, param) }}
            />
          ))}
        </>
      );
    } else if (request.method === "eth_sendTransaction") {
      const param = request?.params[0];
      const parsedData = param?.data ? parseTransactionData(param.data) : undefined;
      return (
        <>
          {param?.value && (
            <>
              <span className="tw-block tw-pt-3">Value</span>
              <code className="tw-block tw-pb-3 tw-break-all">
                {formatUnits(BigInt(param.value))}
              </code>
            </>
          )}
          <span className="tw-block tw-pt-3">From</span>
          <code className="tw-block tw-pb-3 tw-break-all">{param?.from}</code>
          <span className="tw-block tw-pt-3">To</span>
          <code className="tw-block tw-pb-3 tw-break-all">{param?.to}</code>
          {parsedData && param?.data && (
            <>
              <span className="tw-flex tw-items-center tw-justify-between tw-pt-3">
                <span>Data</span>
                <button
                  type="button"
                  className={confirmBtnSecondarySmall}
                  onClick={() => setShowParsed(!showParsed)}
                >
                  {showParsed ? "Hide" : "Show"} Parsed Data
                </button>
              </span>
              {showParsed ? (
                <>
                  <span className="tw-block tw-pt-3">Function Selector</span>
                  <code className="tw-block tw-pb-1 tw-break-all">
                    {parsedData.selector}
                  </code>
                  <span className="tw-block tw-pt-1 tw-pb-1">Arguments</span>
                  {parsedData.args.map((arg, index) => (
                    <code key={index} className="tw-block tw-pb-1 tw-break-all">
                      {index + 1}. {arg}
                    </code>
                  ))}
                </>
              ) : (
                <code className="tw-block tw-pt-3 tw-pb-3 tw-break-all">
                  {param.data}
                </code>
              )}
            </>
          )}
        </>
      );
    } else {
      return request?.params?.map((param, index) => (
        <code key={index} className="tw-block tw-pt-3 tw-pb-3 tw-break-all">
          {JSON.stringify(param)}
        </code>
      ));
    }
  }

  if (!seedRequest) return null;

  return (
    <ConfirmModalShell
      show={!!seedRequest}
      title="Confirm Seed Wallet Request"
      footerClassName={confirmModalFooterBetween}
      dialogClassName={`tw-max-w-2xl ${!isTopModal(SEED_WALLET_REQUEST_MODAL) ? "tw-blur-[5px]" : ""}`.trim()}
      bodyClassName="tw-max-h-[250px] tw-overflow-y-auto"
      footer={
        <>
          <span className="tw-flex tw-flex-col tw-gap-2">
            {balance.data && (
              <span>
                Balance: {fromGWEI(Number(balance.data.value)).toLocaleString()}{" "}
                {balance.data?.symbol}
                {chainId === sepolia.id && (
                  <span className="tw-text-iron-400"> (sepolia)</span>
                )}
              </span>
            )}
            {!hasEnoughBalance && (
              <span className="tw-text-red-400">
                Insufficient balance for transaction
              </span>
            )}
          </span>
          <span className="tw-flex tw-gap-2">
            <button
              type="button"
              onClick={() => onReject(seedRequest)}
              className={confirmBtnDanger}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => onConfirm(seedRequest)}
              className={confirmBtnPrimaryWithIcon}
            >
              <span>Confirm</span>
              {!hasEnoughBalance && (
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  height={14}
                  width={14}
                />
              )}
            </button>
          </span>
        </>
      }
    >
      <div className="tw-mt-2 tw-mb-2">
        <span className="tw-flex tw-flex-col">
          <span>Method</span>
          <code className="tw-break-all">{seedRequest.method}</code>
        </span>
        <span className="tw-flex tw-flex-col tw-pt-3">
          {printParams(seedRequest)}
        </span>
      </div>
    </ConfirmModalShell>
  );
}
