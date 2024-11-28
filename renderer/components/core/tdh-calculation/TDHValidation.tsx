import styles from "./TDHCalculation.module.scss";
import { useEffect, useState } from "react";
import { TDHInfo } from "../eth-scanner/Workers";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faCopy,
  faMinusCircle,
  faXmarkCircle,
} from "@fortawesome/free-solid-svg-icons";
import { SEIZE_API_URL } from "../../../../constants";
import { Table } from "react-bootstrap";

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
    return (
      <FontAwesomeIcon
        icon={icon}
        color={status}
        height={20}
        style={{ display: "block", margin: "0 auto" }}
      />
    );
  }

  if (isFetchingRemote) {
    return <div>Fetching Remote TDH Info...</div>;
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
    <div className={styles.tableContainer}>
      <Table striped bordered className="align-middle">
        <thead>
          <tr>
            <th className="px-3" style={{ maxWidth: "10vw" }}>
              Value
            </th>
            <th className="px-3" style={{ maxWidth: "25vw" }}>
              Your Node
            </th>
            <th className="px-3" style={{ maxWidth: "25vw" }}>
              Seize.io
            </th>
            <th
              className="px-3 justify-content-center"
              style={{ maxWidth: "10vw" }}>
              Match
            </th>
            <th className="px-3" style={{ maxWidth: "30vw" }}>
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3" style={{ maxWidth: "10vw" }}>
              TDH
            </td>
            <td className="px-3" style={{ maxWidth: "25vw" }}>
              {localInfo?.totalTDH?.toLocaleString()}{" "}
              {localInfo?.totalTDH && (
                <CopyIcon text={localInfo.totalTDH.toString()} />
              )}
            </td>
            <td className="px-3" style={{ maxWidth: "25vw" }}>
              {remoteInfo?.tdh?.toLocaleString()}
              {remoteInfo?.tdh && <CopyIcon text={remoteInfo.tdh.toString()} />}
            </td>
            <td className="px-3 text-center" style={{ maxWidth: "10vw" }}>
              {printStatusIcon(tdhIcon, tdhStatus)}
            </td>
            <td className="px-3" style={{ maxWidth: "30vw" }}>
              All TDH across the whole system
            </td>
          </tr>
          <tr>
            <td className="px-3" style={{ maxWidth: "10vw" }}>
              Last Block
            </td>
            <td className="px-3" style={{ maxWidth: "25vw" }}>
              {localInfo?.block}
              {localInfo?.block && (
                <CopyIcon text={localInfo.block.toString()} />
              )}
            </td>
            <td className="px-3" style={{ maxWidth: "25vw" }}>
              {remoteInfo?.block}
              {localInfo?.block && (
                <CopyIcon text={localInfo.block.toString()} />
              )}
            </td>
            <td className="px-3 text-center" style={{ maxWidth: "10vw" }}>
              {printStatusIcon(blockIcon, blockStatus)}
            </td>
            <td className="px-3" style={{ maxWidth: "30vw" }}>
              The last Ethereum block that has been used to calculate TDH
            </td>
          </tr>
          <tr>
            <td className="px-3" style={{ maxWidth: "10vw" }}>
              Merkle Root
            </td>
            <td
              className="px-3 font-smaller text-wrap"
              style={{ wordBreak: "break-word", maxWidth: "25vw" }}>
              {localInfo?.merkleRoot}
            </td>
            <td
              className="px-3 font-smaller text-wrap"
              style={{ wordBreak: "break-word", maxWidth: "25vw" }}>
              {remoteInfo?.merkle_root ?? "N/A"}
            </td>
            <td className="px-3 text-center" style={{ maxWidth: "10vw" }}>
              {printStatusIcon(merkleRootIcon, merkleRootStatus)}
            </td>
            <td className="px-3" style={{ maxWidth: "30vw" }}>
              A hash of all TDH values for all addresses
            </td>
          </tr>
        </tbody>
      </Table>
    </div>
  );
}

function CopyIcon({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 500);
  };

  return (
    <>
      <FontAwesomeIcon
        className="pl-2 cursor-pointer unselectable"
        icon={faCopy}
        height={14}
        color={isCopied ? "green" : "white"}
        onClick={handleCopy}
      />
      {isCopied && (
        <span
          className="pl-2 font-smaller font-light"
          style={{ color: "green" }}>
          Copied!
        </span>
      )}
    </>
  );
}
