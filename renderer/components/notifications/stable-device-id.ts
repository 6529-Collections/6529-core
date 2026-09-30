// NOT IMPLEMENTED in 6529 Desktop
export async function getStableDeviceId(): Promise<string> {
  throw new Error(`Not implemented`);
}

export async function getPushDeviceIdentity(): Promise<{
  deviceId: string;
  previousDeviceId?: string;
}> {
  throw new Error("Mobile push identity is not implemented in 6529 Desktop");
}
