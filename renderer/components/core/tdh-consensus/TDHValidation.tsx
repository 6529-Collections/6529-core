import { useEffect, useState } from "react";
import { TDHInfo } from "../eth-scanner/Workers";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faMinusCircle,
  faXmarkCircle,
} from "@fortawesome/free-solid-svg-icons";
import { SEIZE_API_URL } from "../../../../constants";

export default function TDHValidation({ localInfo }: { localInfo?: TDHInfo }) {
  const [isFetchingRemote, setIsFetchingRemote] = useState(true);
  const [remoteInfo, setRemoteInfo] = useState<{
    tdh: number;
    block: number;
    merkle_root: string;
  }>();

  const fetchRemote = () => {
    fetch(`${SEIZE_API_URL}/oracle/tdh/total`)
      .then((res) => res.json())
      .then((data) => {
        setRemoteInfo(data);
        setIsFetchingRemote(false);
      });
  };

  useEffect(() => {
    fetchRemote();
  }, [localInfo]);

  function printStatusIcon(icon: IconProp, status: string) {
    return <FontAwesomeIcon icon={icon} color={status} height={30} />;
  }

  if (isFetchingRemote) {
    return <div>Fetching TDH info...</div>;
  }

  const tdhStatus = localInfo?.totalTDH === remoteInfo?.tdh ? "green" : "red";
  const tdhIcon =
    localInfo?.totalTDH === remoteInfo?.tdh ? faCheckCircle : faXmarkCircle;
  const blockStatus = localInfo?.block === remoteInfo?.block ? "green" : "red";
  const blockIcon =
    localInfo?.block === remoteInfo?.block ? faCheckCircle : faXmarkCircle;
  const merkleRootStatus = !remoteInfo?.merkle_root
    ? "orange"
    : localInfo?.merkleRoot === remoteInfo?.merkle_root
    ? "green"
    : "red";
  const merkleRootIcon = !remoteInfo?.merkle_root
    ? faMinusCircle
    : localInfo?.merkleRoot === remoteInfo?.merkle_root
    ? faCheckCircle
    : faXmarkCircle;

  return (
    <div className="d-flex flex-column gap-4 seize-card">
      <div className="d-flex align-items-center gap-2">
        {printStatusIcon(tdhIcon, tdhStatus)}
        <h5 className="mb-0">TDH</h5>
        {tdhStatus !== "green" && (
          <span className="font-color-h">
            seize.io value:{" "}
            <code style={{ color: "#92f0f3" }}>
              {remoteInfo?.tdh.toLocaleString()}
            </code>
          </span>
        )}
      </div>
      <div className="d-flex align-items-center gap-2">
        {printStatusIcon(blockIcon, blockStatus)}
        <h5 className="mb-0">TDH Block</h5>
        {blockStatus !== "green" && (
          <span className="font-color-h">
            seize.io value:{" "}
            <code style={{ color: "#92f0f3" }}>{remoteInfo?.block}</code>
          </span>
        )}
      </div>
      <div className="d-flex align-items-center gap-2">
        {printStatusIcon(merkleRootIcon, merkleRootStatus)}
        <h5 className="mb-0">Merkle Root</h5>
        {merkleRootStatus !== "green" && (
          <span className="font-color-h">
            seize.io value:{" "}
            <code style={{ color: "#92f0f3" }}>
              {remoteInfo?.merkle_root ?? "N/A"}
            </code>
          </span>
        )}
      </div>
    </div>
  );
}
