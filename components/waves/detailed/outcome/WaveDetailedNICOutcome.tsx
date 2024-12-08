import { FC, useEffect, useState } from "react";
import { ApiWaveOutcome } from "../../../../generated/models/ApiWaveOutcome";
import { formatNumberWithCommas } from "../../../../helpers/Helpers";
import { motion, AnimatePresence } from "framer-motion";

interface WaveDetailedNICOutcomeProps {
  readonly outcome: ApiWaveOutcome;
}

const DEFAULT_AMOUNTS_TO_SHOW = 3;

export const WaveDetailedNICOutcome: FC<WaveDetailedNICOutcomeProps> = ({
  outcome,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const winnersCount = outcome.distribution?.filter((d) => !!d.amount).length ?? 0;
  const totalCount = outcome.distribution?.length ?? 0;

  const getAmounts = (): number[] => {
    if (showAll) {
      return outcome.distribution?.map((d) => d?.amount ?? 0) ?? [];
    }
    return (
      outcome.distribution
        ?.slice(0, DEFAULT_AMOUNTS_TO_SHOW)
        .map((d) => d?.amount ?? 0) ?? []
    );
  };
  const [amounts, setAmounts] = useState<number[]>(getAmounts());

  useEffect(() => {
    setAmounts(getAmounts());
  }, [showAll]);

  return (
    <div className="tw-overflow-hidden tw-rounded-lg tw-border tw-border-solid tw-border-iron-800 tw-transition-all tw-duration-300 desktop-hover:hover:tw-border-iron-700/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="tw-w-full tw-border-0 tw-px-4 tw-py-3 tw-bg-iron-900/80 tw-transition-colors tw-duration-300 desktop-hover:hover:tw-bg-iron-800/50"
      >
        <div className="tw-flex tw-items-center tw-justify-between">
          <div className="tw-flex tw-items-center tw-gap-3">
            <div className="tw-flex tw-items-center tw-justify-center tw-size-8 tw-rounded-lg tw-bg-blue-400/10">
              <svg
                className="tw-size-5 tw-flex-shrink-0 tw-text-[#A4C2DB]"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 6.75H15M9 12H15M9 17.25H12M3.75 19.5H20.25C21.0784 19.5 21.75 18.8284 21.75 18V6C21.75 5.17157 21.0784 4.5 20.25 4.5H3.75C2.92157 4.5 2.25 5.17157 2.25 6V18C2.25 18.8284 2.92157 19.5 3.75 19.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="tw-text-left">
              <div className="tw-text-sm tw-font-medium tw-text-[#A4C2DB]">
                NIC
              </div>
              <div className="tw-text-xs tw-text-iron-400">
                {formatNumberWithCommas(winnersCount)}{" "}
                {winnersCount === 1 ? "Winner" : "Winners"}
              </div>
            </div>
          </div>

          <div className="tw-flex tw-items-center tw-gap-3">
            <div className="tw-text-right">
              <div className="tw-text-base tw-font-semibold tw-text-[#A4C2DB]">
                {formatNumberWithCommas(outcome.amount ?? 0)}
              </div>
              <div className="tw-text-xs tw-text-iron-400">total pool</div>
            </div>
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
              className="tw-flex-shrink-0 tw-size-4 tw-text-iron-400"
              animate={{ rotate: isOpen ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </motion.svg>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="tw-overflow-hidden"
          >
            <div className="tw-divide-y tw-divide-iron-900 tw-divide-solid tw-divide-x-0">
              {amounts.map((amount, index) => (
                <div
                  key={`wave-detailed-nic-outcome-row-${index}`}
                  className="tw-px-4 tw-py-2 tw-flex tw-items-center tw-justify-between tw-bg-iron-900/30"
                >
                  <div className="tw-flex tw-items-center tw-gap-3">
                    <span className="tw-flex tw-items-center tw-justify-center tw-size-6 tw-rounded-full tw-bg-blue-400/5 tw-text-[#A4C2DB] tw-text-xs tw-font-medium">
                      {index + 1}
                    </span>
                    <span className="tw-text-[#A4C2DB] tw-text-sm tw-font-medium">
                      {formatNumberWithCommas(amount)} NIC
                    </span>
                  </div>
                </div>
              ))}
              {!showAll && totalCount > DEFAULT_AMOUNTS_TO_SHOW && (
                <button
                  onClick={() => setShowAll(true)}
                  className="tw-border-0 tw-w-full tw-px-4 tw-py-2 tw-text-left tw-bg-iron-900/20 tw-text-primary-300/80 tw-text-xs desktop-hover:hover:tw-text-primary-300 tw-transition-colors tw-duration-200 desktop-hover:hover:tw-bg-iron-900/30"
                >
                  <span>View more</span>
                  <span className="tw-ml-1 tw-text-iron-400">•</span>
                  <span className="tw-ml-1 tw-text-iron-400">
                    {totalCount - DEFAULT_AMOUNTS_TO_SHOW} more
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
