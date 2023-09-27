import DistributionPlanTableHeaderWrapper from "../../common/DistributionPlanTableHeaderWrapper";

export default function CreateCustomSnapshotTableHeader() {
  return (
    <DistributionPlanTableHeaderWrapper>
      <th
        scope="col"
        className="tw-py-3 tw-pl-4 tw-pr-3 tw-whitespace-nowrap tw-text-left 
      tw-text-[0.6875rem] tw-leading-[1.125rem] tw-font-medium tw-text-neutral-400 tw-uppercase tw-tracking-[0.25px] sm:tw-pl-6"
      >
        Name
      </th>

      <th
        scope="col"
        className="tw-px-3 tw-py-3 tw-whitespace-nowrap tw-text-left tw-text-[0.6875rem] tw-leading-[1.125rem] tw-font-medium tw-text-neutral-400 tw-uppercase 
      tw-tracking-[0.25px]"
      >
        Wallets
      </th>
      <th
        scope="col"
        className="tw-pl-3 tw-pr-4 tw-py-3 tw-whitespace-nowrap tw-text-left 
      tw-text-[0.6875rem] tw-leading-[1.125rem] tw-font-medium tw-text-neutral-400 tw-uppercase tw-tracking-[0.25px]"
      >
        Tokens
      </th>
    </DistributionPlanTableHeaderWrapper>
  );
}
