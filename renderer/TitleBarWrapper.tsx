import TitleBar from "./components/header/titlebar/TitleBar";
import { isElectron } from "./helpers";

export default function TitleBarWrapper() {
  return isElectron() ? <TitleBar /> : null;
}
