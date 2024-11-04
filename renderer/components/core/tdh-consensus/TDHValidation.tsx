import { useEffect, useState } from "react";
import { TDHInfo } from "../eth-scanner/Workers";
import { SEIZE_API_URL } from "../../../../constants";
import { Table } from "react-bootstrap";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faXmarkCircle,
  faMinusCircle,
} from "@fortawesome/free-solid-svg-icons";

export default function TDHValidation() {
  const [isFetchingLocal, setIsFetchingLocal] = useState(true);
  const [isFetchingRemote, setIsFetchingRemote] = useState(true);
  const [localInfo, setLocalInfo] = useState<TDHInfo>();
  const [remoteInfo, setRemoteInfo] = useState<{
    tdh: number;
    block: number;
  }>();

  const fetchLocal = () => {
    window.api.getTdhInfo().then((tdhInfo) => {
      setLocalInfo(tdhInfo);
      setIsFetchingLocal(false);
    });
  };

  const fetchRemote = () => {
    fetch(`${SEIZE_API_URL}/oracle/tdh/total`)
      .then((res) => res.json())
      .then((data) => {
        setRemoteInfo(data);
        setIsFetchingRemote(false);
      });
  };

  useEffect(() => {
    fetchLocal();
    fetchRemote();
  }, []);

  useEffect(() => {
    if (!isFetchingLocal && !isFetchingRemote && localInfo && remoteInfo) {
    }
  }, [isFetchingLocal, isFetchingRemote]);

  function printStatusIcon(icon: IconProp, status: string) {
    return <FontAwesomeIcon icon={icon} color={status} height={30} />;
  }

  if (isFetchingLocal || isFetchingRemote) {
    return <div>Fetching TDH info...</div>;
  }

  const tdhStatus = localInfo?.totalTDH === remoteInfo?.tdh ? "green" : "red";
  const tdhIcon =
    localInfo?.totalTDH === remoteInfo?.tdh ? faCheckCircle : faXmarkCircle;
  const blockStatus = localInfo?.block === remoteInfo?.block ? "green" : "red";
  const blockIcon =
    localInfo?.block === remoteInfo?.block ? faCheckCircle : faXmarkCircle;

  return (
    <div className="d-flex flex-column gap-4 seize-card">
      <div className="d-flex align-items-center gap-2">
        {printStatusIcon(tdhIcon, tdhStatus)}
        <h5 className="mb-0">TDH Status</h5>
        {tdhStatus === "red" && (
          <span className="font-color-h">
            seize.io value: {remoteInfo?.tdh}
          </span>
        )}
      </div>
      <div className="d-flex align-items-center gap-2">
        {printStatusIcon(blockIcon, blockStatus)}
        <h5 className="mb-0">TDH Block Status</h5>
        {blockStatus === "red" && (
          <span className="font-color-h">
            seize.io value: {remoteInfo?.block}
          </span>
        )}
      </div>
    </div>
  );
}
