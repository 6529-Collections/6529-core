import { useRouter } from "next/router";
import useDeviceInfo from "./hooks/useDeviceInfo";
import TitleBar from "./components/header/titlebar/TitleBar";
import { isElectron } from "./helpers";

export default function TitleBarWrapper() {
  return isElectron() ? <TitleBar /> : null;
}
