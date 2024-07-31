import { SEIZE_API_URL } from "../../../constants";
import CommunityDownloadsComponent from "./CommunityDownloadsComponent";

interface Props {
  view: VIEW;
}

export enum VIEW {
  CONSOLIDATION,
  WALLET,
}

export default function CommunityDownloadsTDH(props: Readonly<Props>) {
  const url = `${SEIZE_API_URL}/api/${
    props.view === VIEW.WALLET ? "uploads" : "consolidated_uploads"
  }`;
  const title = props.view === VIEW.CONSOLIDATION ? `Consolidated ` : ``;
  return <CommunityDownloadsComponent title={`${title} Community`} url={url} />;
}
