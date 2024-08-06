import BlockPickerResultHeader from "./BlockPickerResultHeader";
import BlockPickerResultTable from "./BlockPickerResultTable";

export interface PredictBlockNumbersResponseApiModel {
  readonly blockNumberIncludes: number;
  readonly count: number;
  readonly blockNumbers: number[];
}

export default function BlockPickerResult({
  blocknumber,
  timestamp,
  predictedBlocks,
}: {
  blocknumber: number;
  timestamp: number;
  predictedBlocks: PredictBlockNumbersResponseApiModel[];
}) {
  return (
    <div>
      <BlockPickerResultHeader
        blocknumber={blocknumber}
        timestamp={timestamp}
      />
      {!!predictedBlocks.length && (
        <BlockPickerResultTable predictedBlocks={predictedBlocks} />
      )}
    </div>
  );
}
