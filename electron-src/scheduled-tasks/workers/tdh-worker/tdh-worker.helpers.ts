import moment from "moment-timezone";

export const parseUTCDateString = (dateString: string): Date => {
  const parsedDate = moment.tz(dateString, "YYYY-MM-DD HH:mm:ss", "UTC");
  return parsedDate.toDate();
};

export function getLastTDH() {
  const now = new Date();

  let tdh = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  if (tdh > now) {
    tdh = new Date(tdh.getTime() - 24 * 60 * 60 * 1000);
  }

  const tdhStr = moment(tdh).tz("UTC").format("YYYY-MM-DD HH:mm:ss");
  return parseUTCDateString(tdhStr);
}
