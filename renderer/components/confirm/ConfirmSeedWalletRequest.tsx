"use client";

import {
  ConfirmModalShell,
  confirmBtnDanger,
  confirmBtnPrimaryWithIcon,
  confirmBtnSecondarySmall,
  confirmModalFooterBetween,
  confirmModalHeader,
} from "@/components/shared/ConfirmModalShell";
import { useModalState } from "@/contexts/ModalStateContext";
import { useSeedWallet } from "@/contexts/SeedWalletContext";
import { useToast } from "@/contexts/ToastContext";
import { fromGWEI } from "@/helpers/Helpers";
import { SeedWalletRequest } from "@/shared/types";
import { faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatUnits, toUtf8String } from "ethers";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { sepolia } from "viem/chains";
import { useBalance, useChainId } from "wagmi";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import {
  describeTypedDataField,
  formatTypedDataValue,
} from "@/wagmiConfig/typedDataDisplay";
import {
  parseTypedDataRequest,
  SIGN_TYPED_DATA_V4,
} from "@/wagmiConfig/typedDataRequest";
import {
  SEED_WALLET_REQUEST_BODY_CLASS,
  SEED_WALLET_REQUEST_DIALOG_CLASS,
  SEED_WALLET_REQUEST_FIXED_SECTION_CLASS,
} from "./seed-wallet-request-layout";

const SEED_WALLET_REQUEST_MODAL = "SeedWalletRequestModal";

function withStableKeys<T>(items: readonly T[]) {
  const occurrences = new Map<string, number>();

  return items.map((item) => {
    const serializedItem =
      typeof item === "string" ? item : (JSON.stringify(item) ?? String(item));
    const occurrence = (occurrences.get(serializedItem) ?? 0) + 1;
    occurrences.set(serializedItem, occurrence);

    return {
      item,
      key: `${serializedItem}:${occurrence}`,
    };
  });
}

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

export default function ConfirmSeedWalletRequest({
  onShowChange,
  suppress = false,
}: Readonly<{
  onShowChange?: (show: boolean) => void;
  suppress?: boolean | undefined;
}> = {}) {
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
  const onShowChangeRef = useRef(onShowChange);
  const latestShowRef = useRef(show);

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

  useEffect(() => {
    onShowChangeRef.current = onShowChange;
  }, [onShowChange]);

  useEffect(() => {
    latestShowRef.current = show;
    onShowChange?.(show);
  }, [onShowChange, show]);

  useEffect(() => {
    return () => {
      if (latestShowRef.current) {
        onShowChangeRef.current?.(false);
      }
    };
  }, []);

  const clear = useCallback(() => {
    setSeedRequest(undefined);
    setShow(false);
  }, []);

  const onReject = (request: SeedWalletRequest) => {
    window.seedConnector.reject(request.requestId);
    clear();
  };

  const onConfirm = (request: SeedWalletRequest) => {
    window.seedConnector.confirm(request.requestId);
    clear();
  };

  useEffect(() => {
    if (!suppress || !seedRequest) {
      return;
    }

    window.seedConnector.reject(seedRequest.requestId);
    clear();
  }, [clear, seedRequest, suppress]);

  const handleRequestRef = useRef(seedWalletContext.handleRequest);
  const refetchBalance = balance.refetch;
  useEffect(() => {
    handleRequestRef.current = seedWalletContext.handleRequest;
  }, [seedWalletContext.handleRequest]);

  useEffect(() => {
    const stopRequests = window.seedConnector?.onInitRequest((request) => {
      handleRequestRef.current((approvedForReview) => {
        setSeedRequest(approvedForReview);
        void refetchBalance();
        setShow(true);
      }, request);
    });
    const stopToasts = window.seedConnector?.onShowToast((toast) => {
      showToast(toast.message, toast.type, true);
    });
    return () => {
      stopRequests?.();
      stopToasts?.();
    };
  }, [refetchBalance, showToast]);

  useEffect(() => {
    return window.seedConnector?.onSettled((requestId) => {
      if (seedRequest?.requestId === requestId) clear();
    });
  }, [clear, seedRequest]);

  function getPersonalSignParamLines(param: string, index: number): string[] {
    if (index !== 0) return [param];
    try {
      const message = toUtf8String(param);
      return /[\x00-\x08\x0b-\x1f\x7f]/.test(message) ? [param] : message.split("\n");
    } catch {
      return [param];
    }
  }

  function printTypedData(request: SeedWalletRequest) {
    let typedData: ReturnType<typeof parseTypedDataRequest>;
    try {
      typedData = parseTypedDataRequest(request.params);
    } catch (error: unknown) {
      return (
        <code className="tw-block tw-break-all tw-pb-3 tw-pt-3 tw-text-red">
          {error instanceof Error ? error.message : "Invalid typed data"}
        </code>
      );
    }
    // Format before keying: a domain chain ID is a bigint, which JSON.stringify
    // cannot serialize.
    const domainEntries = Object.entries(typedData.domain).map(
      ([name, value]) => [name, formatTypedDataValue(value)] as const
    );
    const messageEntries = Object.entries(typedData.message).map(
      ([name, value]) =>
        [
          name,
          formatTypedDataValue(value),
          describeTypedDataField(typedData.primaryType, name, value),
        ] as const
    );
    return (
      <>
        <span className="tw-block tw-pt-3">Typed data (EIP-712)</span>
        <code className="tw-block tw-break-all tw-pb-3">
          {typedData.primaryType}
        </code>
        {withStableKeys(domainEntries).map(({ item: [name, value], key }) => (
          <code key={`domain:${key}`} className="tw-block tw-break-all tw-pb-1">
            domain.{name}: {value}
          </code>
        ))}
        {withStableKeys(messageEntries).map(
          ({ item: [name, value, note], key }) => (
            <code key={key} className="tw-block tw-break-all tw-pb-1">
              {name}: {value}
              {note ? (
                <span className="tw-text-iron-400"> ({note})</span>
              ) : null}
            </code>
          )
        )}
      </>
    );
  }

  function printParams(request: SeedWalletRequest) {
    if (request.method === "personal_sign") {
      return (
        <>
          <span>Parameters</span>
          {withStableKeys(request?.params ?? []).map(
            ({ item: param, key }, index) => {
              const lines = getPersonalSignParamLines(param, index);
              return (
                <code
                  key={key}
                  className="tw-block tw-break-all tw-pb-3 tw-pt-3"
                >
                  <span>{index + 1}: </span>
                  {withStableKeys(lines).map(
                    ({ item: line, key }, lineIndex) => (
                      <Fragment key={key}>
                        {lineIndex > 0 && <br />}
                        {line}
                      </Fragment>
                    )
                  )}
                </code>
              );
            }
          )}
        </>
      );
    } else if (request.method === "eth_sendTransaction") {
      const param = request?.params[0];
      const parsedData = param?.data
        ? parseTransactionData(param.data)
        : undefined;
      return (
        <>
          {param?.value && (
            <>
              <span className="tw-block tw-pt-3">Value</span>
              <code className="tw-block tw-break-all tw-pb-3">
                {formatUnits(BigInt(param.value))}
              </code>
            </>
          )}
          <span className="tw-block tw-pt-3">From</span>
          <code className="tw-block tw-break-all tw-pb-3">{param?.from}</code>
          <span className="tw-block tw-pt-3">To</span>
          <code className="tw-block tw-break-all tw-pb-3">{param?.to}</code>
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
                  <code className="tw-block tw-break-all tw-pb-1">
                    {parsedData.selector}
                  </code>
                  <span className="tw-block tw-pb-1 tw-pt-1">Arguments</span>
                  {withStableKeys(parsedData.args).map(
                    ({ item: arg, key }, index) => (
                      <code key={key} className="tw-block tw-break-all tw-pb-1">
                        {index + 1}. {arg}
                      </code>
                    )
                  )}
                </>
              ) : (
                <code className="tw-block tw-break-all tw-pb-3 tw-pt-3">
                  {param.data}
                </code>
              )}
            </>
          )}
        </>
      );
    } else if (request.method === SIGN_TYPED_DATA_V4) {
      return printTypedData(request);
    } else {
      return withStableKeys(request?.params ?? []).map(
        ({ item: param, key }) => (
          <code key={key} className="tw-block tw-break-all tw-pb-3 tw-pt-3">
            {JSON.stringify(param)}
          </code>
        )
      );
    }
  }

  if (!seedRequest) return null;

  return (
    <ConfirmModalShell
      show={!!seedRequest}
      title="Confirm Seed Wallet Request"
      headerClassName={`${confirmModalHeader} ${SEED_WALLET_REQUEST_FIXED_SECTION_CLASS}`}
      footerClassName={`${confirmModalFooterBetween} ${SEED_WALLET_REQUEST_FIXED_SECTION_CLASS}`}
      dialogClassName={`${SEED_WALLET_REQUEST_DIALOG_CLASS} ${!isTopModal(SEED_WALLET_REQUEST_MODAL) ? "tw-blur-[5px]" : ""}`.trim()}
      bodyClassName={SEED_WALLET_REQUEST_BODY_CLASS}
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
      <div className="tw-mb-2 tw-mt-2">
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
