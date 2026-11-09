const mockServiceConstructor = jest.fn();
const mockInit = jest.fn();
const mockAddFile = jest.fn();
const mockUploadProfilePicture = jest.fn();
const mockSanitizeProfilePicture = jest.fn();

jest.mock("@/components/ipfs/IPFSService", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((config: unknown) => {
    mockServiceConstructor(config);
    return { init: mockInit, addFile: mockAddFile };
  }),
}));

jest.mock("@/services/api/profile-picture-upload-api", () => ({
  uploadProfilePicture: (file: File) => mockUploadProfilePicture(file),
}));

const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const API_URL = "ipfs://QmApiPinnedPictureCid";
const LOCAL_NODE = {
  status: "ready",
  apiEndpoint: "http://127.0.0.1:5001",
  gatewayEndpoint: "http://127.0.0.1:8080",
  mfsPath: "/6529",
};

type Upload = (file: File, retryVia6529?: boolean) => Promise<string>;

// A fresh module per test, so the lazily created local client starts empty.
function loadUpload(): Upload {
  let upload: Upload | undefined;
  jest.isolateModules(() => {
    ({ uploadProfilePictureFile: upload } =
      require("@/components/ipfs/profilePictureUpload") as {
        uploadProfilePictureFile: Upload;
      });
  });
  return upload!;
}

function setDesktopBridge(ipfsInfo: unknown): void {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      getIpfsInfo: jest.fn().mockResolvedValue(ipfsInfo),
      getInfo: jest.fn().mockResolvedValue({}),
      sanitizeProfilePicture: mockSanitizeProfilePicture,
    },
  });
}

const picture = () => {
  const file = new File(["original"], "avatar.png", { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(file.size),
  });
  return file;
};

const sanitizedFile = expect.objectContaining({
  name: "pfp.png",
  size: 3,
  type: "image/png",
});

describe("profile picture uploads in the Core renderer", () => {
  const originalApi = window.api;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
    mockAddFile.mockResolvedValue(CID);
    mockUploadProfilePicture.mockResolvedValue(API_URL);
    mockSanitizeProfilePicture.mockResolvedValue({
      ok: true,
      bytes: new ArrayBuffer(3),
      contentType: "image/png",
      fileName: "pfp.png",
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: originalApi,
    });
  });

  it("pins the picture on Desktop's local node and never calls the API", async () => {
    setDesktopBridge(LOCAL_NODE);
    const file = picture();

    await expect(loadUpload()(file)).resolves.toBe(`ipfs://${CID}`);

    expect(mockServiceConstructor).toHaveBeenCalledWith({
      apiEndpoint: "http://127.0.0.1:5001",
      mfsPath: "/6529",
    });
    expect(mockAddFile).toHaveBeenCalledWith(sanitizedFile);
    expect(mockUploadProfilePicture).not.toHaveBeenCalled();
  });

  it("reuses the local node client for later uploads", async () => {
    setDesktopBridge(LOCAL_NODE);
    const upload = loadUpload();

    await upload(picture());
    await upload(picture());

    expect(mockServiceConstructor).toHaveBeenCalledTimes(1);
    expect(mockAddFile).toHaveBeenCalledTimes(2);
  });

  it("uploads the sanitized picture via the API when local IPFS is off", async () => {
    setDesktopBridge({ status: "disabled" });
    await expect(loadUpload()(picture())).resolves.toBe(API_URL);
    expect(mockUploadProfilePicture).toHaveBeenCalledWith(sanitizedFile);
    expect(mockServiceConstructor).not.toHaveBeenCalled();
  });

  it.each(["starting", "stopped", "unavailable"])(
    "requires an explicit retry when the local node is %s",
    async (status) => {
      setDesktopBridge({ status });

      await expect(loadUpload()(picture())).rejects.toThrow(
        "Local IPFS couldn’t upload this picture"
      );

      expect(mockServiceConstructor).not.toHaveBeenCalled();
      expect(mockUploadProfilePicture).not.toHaveBeenCalled();
    }
  );

  it("offers a retry after a failed local upload and sends only the sanitized picture", async () => {
    setDesktopBridge(LOCAL_NODE);
    mockAddFile.mockRejectedValueOnce(new Error("Pin failed"));
    const file = picture();
    const upload = loadUpload();

    await expect(upload(file)).rejects.toMatchObject({
      name: "LocalProfilePictureUploadError",
    });
    expect(mockUploadProfilePicture).not.toHaveBeenCalled();
    await expect(upload(file, true)).resolves.toBe(API_URL);
    expect(mockAddFile).toHaveBeenCalledTimes(1);
    expect(mockUploadProfilePicture).toHaveBeenCalledWith(sanitizedFile);
  });

  it.each([
    ["ready", false],
    ["disabled", false],
    ["unavailable", true],
  ] as const)("stops both upload paths if cleanup fails (%s, retry %s)", async (status, retry) => {
    setDesktopBridge({ status });
    mockSanitizeProfilePicture.mockResolvedValueOnce({ ok: false, error: "Cleanup failed" });
    await expect(loadUpload()(picture(), retry)).rejects.toThrow("Cleanup failed");
    expect(mockAddFile).not.toHaveBeenCalled();
    expect(mockUploadProfilePicture).not.toHaveBeenCalled();
  });

  it("keeps the website's API upload outside Desktop", async () => {
    Object.defineProperty(window, "api", {
      configurable: true,
      value: undefined,
    });
    const file = picture();

    await expect(loadUpload()(file)).resolves.toBe(API_URL);

    expect(mockUploadProfilePicture).toHaveBeenCalledWith(file);
    expect(mockServiceConstructor).not.toHaveBeenCalled();
  });
});
