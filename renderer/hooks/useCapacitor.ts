enum CapacitorOrientationType {
  PORTRAIT,
  LANDSCAPE,
}

const useCapacitor = () => {
  const isCapacitor = false;
  const platform = "desktop";
  const keyboardVisible = false;
  const isIos = false;
  const isAndroid = false;
  const orientation = CapacitorOrientationType.PORTRAIT;
  const isActive = false;

  return {
    isCapacitor,
    platform,
    keyboardVisible,
    isIos,
    isAndroid,
    orientation,
    isActive,
  };
};

export default useCapacitor;
