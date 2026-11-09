// Desktop keeps profile pictures on the user's own IPFS node (owner decision);
// the website path, outside Desktop, uploads through the 6529 API.

const mockServiceConstructor = jest.fn();
const mockInit = jest.fn();
const mockAddFile = jest.fn();
const mockUploadProfilePicture = jest.fn();

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

type Upload = (file: File) => Promise<string>;

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
    },
  });
}

const picture = () => new File(["png"], "avatar.png", { type: "image/png" });

describe("profile picture uploads in the Core renderer", () => {
  const originalApi = window.api;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInit.mockResolvedValue(undefined);
    mockAddFile.mockResolvedValue(CID);
    mockUploadProfilePicture.mockResolvedValue(API_URL);
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
    expect(mockAddFile).toHaveBeenCalledWith(file);
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

  it.each(["disabled", "starting", "stopped", "unavailable"])(
    "fails with a %s local node instead of falling back to the API",
    async (status) => {
      setDesktopBridge({ status });

      await expect(loadUpload()(picture())).rejects.toThrow(
        "Local IPFS is off or unavailable"
      );

      expect(mockServiceConstructor).not.toHaveBeenCalled();
      expect(mockUploadProfilePicture).not.toHaveBeenCalled();
    }
  );

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
