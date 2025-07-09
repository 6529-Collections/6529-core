import { SEIZE_API_URL } from "@/electron-constants";
import CommunityDownloadsComponent from "./CommunityDownloadsComponent";

export enum VIEW {
  CONSOLIDATION,
  WALLET,
}

interface Props {
  view: VIEW;
}

export default function CommunityDownloadsTDH(props: Readonly<Props>) {
  const url = `${SEIZE_API_URL}/api/${
    props.view === VIEW.WALLET ? "uploads" : "consolidated_uploads"
  }`;
  const title = props.view === VIEW.CONSOLIDATION ? `Consolidated ` : ``;
  return <CommunityDownloadsComponent title={`${title} Network`} url={url} />;
}
