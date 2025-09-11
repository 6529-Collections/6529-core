import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Accordion, Button, Col, Container, Row } from "react-bootstrap";
import { Tooltip } from "react-tooltip";
import { useToast } from "../../../contexts/ToastContext";
import {
  deactivateRpcProvider,
  deleteRpcProvider,
  setRpcProviderActive,
} from "../../../electron";
import styles from "./ETHScanner.module.scss";

export interface RPCProvider {
  readonly id: number;
  readonly url: string;
  readonly name: string;
  readonly active: boolean;
  readonly deletable: boolean;
}

export function RPCProviderCards({
  rpcProviders,
  onRefresh,
}: {
  readonly rpcProviders: RPCProvider[];
  readonly onRefresh: () => void;
}) {
  return (
    <Accordion>
      <Accordion.Item
        className={`${styles.rpcProvidersAccordionItem}`}
        eventKey={"0"}>
        <Accordion.Header>Providers List</Accordion.Header>
        <Accordion.Body
          className="d-flex flex-wrap gap-2"
          style={{ backgroundColor: "var($bg-color-2)" }}>
          <Container>
            <Row>
              {rpcProviders.map((r) => (
                <RPCProviderCard
                  key={r.url}
                  rpcProvider={r}
                  onRefresh={onRefresh}
                />
              ))}
            </Row>
          </Container>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );

  return (
    <>
      {rpcProviders.length > 0 ? (
        rpcProviders.map((r) => (
          <RPCProviderCard key={r.url} rpcProvider={r} onRefresh={onRefresh} />
        ))
      ) : (
        <div>No RPC Providers found</div>
      )}
    </>
  );
}

function RPCProviderCard({
  rpcProvider,
  onRefresh,
}: {
  readonly rpcProvider: RPCProvider;
  readonly onRefresh: () => void;
}) {
  const { showToast } = useToast();

  const handleMakeActive = async () => {
    try {
      const data = await setRpcProviderActive(rpcProvider.id);

      if (data.error) {
        showToast(`Error creating RPC provider - ${data.data}`, "error");
      } else {
        showToast(
          `RPC provider '${rpcProvider.name}' set as active`,
          "success"
        );
        onRefresh();
      }
    } catch (error) {
      showToast(`Error setting RPC provider as active - ${error}`, "error");
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateRpcProvider(rpcProvider.id);
      showToast(`RPC provider '${rpcProvider.name}' deactivated`, "success");
      onRefresh();
    } catch (error) {
      showToast(`Error deactivating RPC provider - ${error}`, "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRpcProvider(rpcProvider.id);
      showToast(`RPC provider '${rpcProvider.name}' deleted`, "success");
      onRefresh();
    } catch (error) {
      showToast(`Error deleting RPC provider - ${error}`, "error");
    }
  };

  return (
    <Col xs={12} sm={6} md={4} lg={3} className="pt-2 pb-2">
      <Container className={styles.rpcUrl}>
        <Row>
          <Col className="d-flex align-items-center justify-content-between">
            <span className="d-flex align-items-center gap-1">
              <span>{rpcProvider.name}</span>
              {!rpcProvider.deletable && (
                <>
                  <span
                    className="cursor-help"
                    data-tooltip-id="default-rpc-provider-tooltip">
                    *
                  </span>
                  <Tooltip
                    id="default-rpc-provider-tooltip"
                    style={{
                      backgroundColor: "#1F2937",
                      color: "white",
                      padding: "4px 8px",
                    }}>
                    Default RPC provider - cannot be deleted
                  </Tooltip>
                </>
              )}
            </span>
            {rpcProvider.active && (
              <span className="d-flex align-items-center gap-1">
                <FontAwesomeIcon
                  icon={faCheckCircle}
                  color="green"
                  height={16}
                />
                <span className="font-smaller font-lighter">Active</span>
              </span>
            )}
          </Col>
        </Row>
        <Row className="pt-2">
          <Col className="font-lighter font-smaller ellipsis">
            {rpcProvider.url}
          </Col>
        </Row>
        <Row className="pt-3">
          <Col className="d-flex align-items-center">
            {rpcProvider.active ? (
              <span className="d-flex align-items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDeactivate()}>
                  <span className="font-smaller">Deactivate</span>
                </Button>
              </span>
            ) : (
              <span className="d-flex align-items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleMakeActive()}>
                  <span className="font-smaller">Set Active</span>
                </Button>
                {rpcProvider.deletable && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete()}>
                    <span className="font-smaller">Delete</span>
                  </Button>
                )}
              </span>
            )}
          </Col>
        </Row>
      </Container>
    </Col>
  );
}

export function RPCProviderAdd({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button variant="primary" onClick={onClick}>
      Add RPC Provider
    </Button>
  );
}
