import { useRecentENSRegistrations } from "../hooks/useRecentENSRegistrations";
import { Spinner, Alert } from "react-bootstrap";

export function RecentENSRegistrations() {
  const { data: registrations, isLoading, error } = useRecentENSRegistrations();

  if (isLoading) {
    return (
      <div className="tw-flex tw-justify-center tw-items-center tw-py-4">
        <Spinner animation="border" role="status" className="tw-text-zinc-400">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        variant="danger"
        className="tw-bg-red-900/30 tw-border-red-800 tw-text-white"
      >
        Error loading recent registrations: {(error as Error).message}
      </Alert>
    );
  }

  return (
    <div className="tw-bg-zinc-900/30 tw-backdrop-blur-sm tw-rounded-lg tw-border tw-border-zinc-800/50 tw-p-4">
      <h4 className="tw-text-lg tw-font-bold tw-text-white tw-mb-4">
        Recent ENS Registrations
      </h4>
      <div className="tw-space-y-3">
        {registrations?.map((reg) => (
          <div
            key={reg.name}
            className="tw-bg-zinc-900/50 tw-rounded tw-p-3 tw-text-sm"
          >
            <div className="tw-font-medium tw-text-white">{reg.name}</div>
            <div className="tw-text-zinc-400">
              Registered:{" "}
              {new Date(reg.registrationDate).toLocaleDateString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
            <div className="tw-text-zinc-500 tw-font-mono tw-text-xs">
              Owner: {reg.owner.slice(0, 6)}...{reg.owner.slice(-4)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
