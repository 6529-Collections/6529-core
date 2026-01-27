import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "react-tooltip";
import { useToast } from "../../../contexts/ToastContext";
import {
  deactivateRpcProvider,
  deleteRpcProvider,
  setRpcProviderActive,
} from "../../../electron";

export interface RPCProvider {
  readonly id: number;
  readonly url: string;
  readonly name: string;
  readonly active: boolean;
  readonly deletable: boolean;
}

export function RPCProviderCards({
  rpcProviders,
  onRefresh,
}: {
  readonly rpcProviders: RPCProvider[];
  readonly onRefresh: () => void;
}) {
  return (
    <details
      className="tw-group tw-overflow-hidden tw-rounded-xl tw-bg-iron-950 tw-ring-1 tw-ring-inset tw-ring-iron-800"
    >
      <summary className="tw-flex tw-cursor-pointer tw-list-none tw-items-center tw-gap-2 tw-rounded-t-xl tw-px-4 tw-py-3 tw-font-medium tw-transition-colors desktop-hover:hover:tw-bg-iron-900 [&::-webkit-details-marker]:tw-hidden">
        <ChevronRightIcon className="tw-size-4 tw-shrink-0 tw-transition-transform group-open:tw-rotate-90" />
        <span>Providers List</span>
      </summary>
      <div className="tw-grid tw-grid-cols-1 sm:tw-grid-cols-2 lg:tw-grid-cols-4 tw-gap-3 tw-p-4">
        {rpcProviders.map((r) => (
          <RPCProviderCard key={r.url} rpcProvider={r} onRefresh={onRefresh} />
        ))}
      </div>
    </details>
  );
}

function RPCProviderCard({
  rpcProvider,
  onRefresh,
}: {
  readonly rpcProvider: RPCProvider;
  readonly onRefresh: () => void;
}) {
  const { showToast } = useToast();

  const handleMakeActive = async () => {
    try {
      const data = await setRpcProviderActive(rpcProvider.id);

      if (data.error) {
        showToast(`Error creating RPC provider - ${data.data}`, "error");
      } else {
        showToast(
          `RPC provider '${rpcProvider.name}' set as active`,
          "success"
        );
        onRefresh();
      }
    } catch (error) {
      showToast(`Error setting RPC provider as active - ${error}`, "error");
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateRpcProvider(rpcProvider.id);
      showToast(`RPC provider '${rpcProvider.name}' deactivated`, "success");
      onRefresh();
    } catch (error) {
      showToast(`Error deactivating RPC provider - ${error}`, "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRpcProvider(rpcProvider.id);
      showToast(`RPC provider '${rpcProvider.name}' deleted`, "success");
      onRefresh();
    } catch (error) {
      showToast(`Error deleting RPC provider - ${error}`, "error");
    }
  };

  return (
    <div className="tw-min-w-0">
      <div className="tw-rounded-xl tw-bg-black tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800">
        <div className="tw-flex tw-items-center tw-justify-between">
          <span className="tw-flex tw-items-center tw-gap-1">
            <span>{rpcProvider.name}</span>
              {!rpcProvider.deletable && (
                <>
                  <span
                    className="cursor-help"
                    data-tooltip-id="default-rpc-provider-tooltip"
                  >
                    *
                  </span>
                  <Tooltip
                    id="default-rpc-provider-tooltip"
                    style={{
                      backgroundColor: "#1F2937",
                      color: "white",
                      padding: "4px 8px",
                    }}
                  >
                    Default RPC provider - cannot be deleted
                  </Tooltip>
                </>
              )}
            </span>
            {rpcProvider.active && (
              <span className="tw-flex tw-items-center tw-gap-1">
                <FontAwesomeIcon
                  icon={faCheckCircle}
                  color="green"
                  height={16}
                />
                <span className="tw-text-xs tw-font-light tw-text-iron-400">Active</span>
              </span>
            )}
        </div>
        <div className="tw-pt-2 tw-text-xs tw-font-light tw-text-iron-400 tw-overflow-hidden tw-text-ellipsis tw-whitespace-nowrap">
          {rpcProvider.url}
        </div>
        <div className="tw-pt-3 tw-flex tw-items-center">
            {rpcProvider.active ? (
              <span className="tw-flex tw-items-center tw-gap-2">
                <button
                  type="button"
                  onClick={() => handleDeactivate()}
                  className="tw-whitespace-nowrap tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-[#dc2626] tw-px-3 tw-py-1.5 tw-text-xs tw-font-normal tw-text-white tw-antialiased tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-red focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-black desktop-hover:hover:tw-bg-[#ef4444]"
                >
                  Deactivate
                </button>
              </span>
            ) : (
              <span className="tw-flex tw-items-center tw-gap-2">
                <button
                  type="button"
                  onClick={() => handleMakeActive()}
                  className="tw-whitespace-nowrap tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-3 tw-py-1.5 tw-text-xs tw-font-normal tw-text-white tw-antialiased tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-black desktop-hover:hover:tw-bg-primary-600"
                >
                  Set Active
                </button>
                {rpcProvider.deletable && (
                  <button
                    type="button"
                    onClick={() => handleDelete()}
                    className="tw-whitespace-nowrap tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-[#dc2626] tw-px-3 tw-py-1.5 tw-text-xs tw-font-normal tw-text-white tw-antialiased tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-red focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-black desktop-hover:hover:tw-bg-[#ef4444]"
                  >
                    Delete
                  </button>
                )}
              </span>
            )}
        </div>
      </div>
    </div>
  );
}

export function RPCProviderAdd({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-p-3 tw-text-xs tw-font-normal tw-text-white tw-antialiased tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 desktop-hover:hover:tw-bg-primary-600"
    >
      Add RPC Provider
    </button>
  );
}
