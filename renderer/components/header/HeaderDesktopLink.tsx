import { NavDropdown } from "react-bootstrap";
import { useRouter } from "next/router";
import styles from "./Header.module.scss";
import { HeaderLink } from "./Header";

export default function HeaderDesktopLink({
  link,
  disabled,
}: {
  readonly link: HeaderLink;
  readonly disabled?: boolean;
}) {
  const router = useRouter();

  const handleNavigation = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default anchor navigation
    if (!disabled) {
      router.push(link.path);
    }
  };

  return (
    <NavDropdown.Item className="tw-h-full" onClick={handleNavigation}>
      <div className="tw-no-underline tw-h-full tw-w-full tw-p-0 tw-m-0 tw-inline-flex tw-justify-between">
        {link.name}
        {link.isNew && <span className={styles.new}>new</span>}
      </div>
    </NavDropdown.Item>
  );
}
