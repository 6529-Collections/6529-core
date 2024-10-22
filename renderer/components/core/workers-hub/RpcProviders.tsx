import styles from "./WorkersHub.module.scss";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Col, Container, Row, Button } from "react-bootstrap";
import {
  deactivateRpcProvider,
  deleteRpcProvider,
  setRpcProviderActive,
} from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";

export interface RPCProvider {
  readonly id: number;
  readonly url: string;
  readonly name: string;
  readonly active: boolean;
}

export function RPCProviderCards({
  rpcProviders,
  onRefresh,
}: {
  readonly rpcProviders: RPCProvider[];
  readonly onRefresh: () => void;
}) {
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
            <span>{rpcProvider.name}</span>
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
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete()}>
                  <span className="font-smaller">Delete</span>
                </Button>
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
    <Button variant="success" onClick={onClick}>
      Add RPC Provider
    </Button>
  );
}
