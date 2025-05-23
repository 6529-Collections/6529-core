import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { motion, AnimatePresence } from "framer-motion";

interface DateAccordionProps {
  readonly title: React.ReactNode;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly collapsedContent?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly showChevron?: boolean;
}

export default function DateAccordion({
  title,
  isExpanded,
  onToggle,
  collapsedContent,
  children,
  showChevron = true,
}: DateAccordionProps) {
  return (
    <motion.div
      className="tw-bg-iron-900 tw-rounded-xl tw-ring-1 tw-ring-iron-700/50 tw-shadow-sm"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div
        onClick={onToggle}
        className="tw-px-5 tw-h-16 tw-cursor-pointer tw-flex tw-items-center tw-justify-between tw-w-full desktop-hover:hover:tw-bg-iron-800/50 tw-transition-colors tw-duration-200"
      >
        <div className="tw-flex tw-items-center tw-justify-between tw-w-full">
          <div className="tw-flex tw-items-center tw-gap-x-3">
            <motion.div
              animate={isExpanded ? { rotate: 0 } : { rotate: 180 }}
              transition={{ duration: 0.3 }}
              className="tw-p-1.5 tw-rounded-full desktop-hover:hover:tw-bg-iron-700/30 tw-transition-colors tw-duration-200"
            >
              <FontAwesomeIcon
                icon={faChevronDown}
                className={`tw-size-4 ${showChevron ? 'tw-text-primary-400' : 'tw-text-iron-700'} tw-transition-all tw-duration-200`}
              />
            </motion.div>
            <p className="tw-mb-0 tw-text-base tw-font-semibold tw-text-iron-300">
              {title}
            </p>
          </div>
          {!isExpanded && collapsedContent && (
            <div className="tw-opacity-80 hover:tw-opacity-100 tw-transition-opacity tw-duration-200">
              {collapsedContent}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
