"use client";

import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef, useState, RefObject } from "react";
import { Tooltip } from "react-tooltip";
import styles from "./TitleBar.module.scss";

type TooltipButtonProps = {
  buttonStyles: string;
  placement?: "top" | "bottom" | "left" | "right";
  onClick: () => void;
  icon: IconProp;
  iconStyles?: string;
  content?: string;
  buttonContent?: string;
  hideOnClick?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
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
  onContextMenu,
  buttonRef,
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
        ref={buttonRef as RefObject<HTMLButtonElement>}
        data-tooltip-id={tooltipId}
        className={`${buttonStyles} d-flex`}
        onClick={handleButtonClick}
        onContextMenu={onContextMenu}
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
        hidden={!tooltipVisible}
        variant="light"
        className={styles.tooltip}>
        {content}
      </Tooltip>
    </>
  );
};

export default TooltipButton;
