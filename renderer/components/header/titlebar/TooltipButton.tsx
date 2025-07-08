"use client";

import styles from "./TitleBar.module.scss";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef, useState } from "react";
import { Tooltip } from "react-tooltip";

type TooltipButtonProps = {
  buttonStyles: string;
  placement?: "top" | "bottom" | "left" | "right";
  onClick: () => void;
  icon: IconProp;
  iconStyles?: string;
  content?: string;
  buttonContent?: string;
  hideOnClick?: boolean;
};

const TooltipButton: React.FC<TooltipButtonProps> = ({
  buttonStyles,
  placement = "right",
  onClick,
  icon,
  iconStyles,
  content,
  buttonContent,
  hideOnClick = true,
}) => {
  const delay = 300;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleButtonClick = () => {
    onClick();
    if (hideOnClick) {
      setTooltipVisible(false);
    }
  };

  const handleMouseEnter = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
    }
    hoverTimeout.current = setTimeout(
      () => {
        setTooltipVisible(true);
      },
      Array.isArray(delay) ? delay[0] : delay
    );
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
    }
    setTooltipVisible(false);
  };

  const tooltipId = `tooltip-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <>
      <button
        data-tooltip-id={tooltipId}
        className={`${buttonStyles} d-flex`}
        onClick={handleButtonClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}>
        {buttonContent && (
          <span className={styles.buttonContent}>{buttonContent}</span>
        )}
        <FontAwesomeIcon icon={icon} className={iconStyles} />
      </button>
      <Tooltip
        id={tooltipId}
        delayShow={150}
        opacity={1}
        place={placement}
        variant="light"
        className={styles.tooltip}>
        {content}
      </Tooltip>
    </>
  );
};

export default TooltipButton;
