import styles from "./TitleBar.module.scss";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tippy from "@tippyjs/react";
import { useRef, useState } from "react";

type TooltipButtonProps = {
  buttonStyles: string;
  placement?: "top" | "bottom" | "left" | "right";
  onClick: () => void;
  icon: IconProp;
  content?: string;
};

const TooltipButton: React.FC<TooltipButtonProps> = ({
  buttonStyles,
  placement = "right",
  onClick,
  icon,
  content,
}) => {
  const delay = 300;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleButtonClick = () => {
    onClick();
    setTooltipVisible(false);
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

  return (
    <Tippy
      className={styles.tippy}
      content={content}
      placement={placement}
      theme="light"
      visible={tooltipVisible}
      onClickOutside={() => setTooltipVisible(false)}
      onShow={(instance) => handleMouseEnter()}
      onHide={(instance) => handleMouseLeave()}>
      <button
        className={buttonStyles}
        onClick={handleButtonClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}>
        <FontAwesomeIcon icon={icon} />
      </button>
    </Tippy>
  );
};

export default TooltipButton;
