const useCapacitor = () => {
  const isCapacitor = false;

  function sendNotification(id: number, title: string, body: string) {
    console.error(
      "Notifications are not supported in the current environment."
    );
  }

  return { isCapacitor, sendNotification };
};

export default useCapacitor;
