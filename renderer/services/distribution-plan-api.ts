import { AllowlistToolResponse } from "../components/allowlist-tool/allowlist-tool.types";
import { makeErrorToast } from "./distribution-plan.utils";
import { ALLOWLIST_API_ENDPOINT } from "../../electron-constants";
import { getAuthJwt, removeAuthJwt } from "./auth/auth.utils";

const handleResponse = async <T>(
  res: Response
): Promise<{
  readonly success: boolean;
  readonly data: T | null;
}> => {
  if (res.status === 401) {
    removeAuthJwt();
    makeErrorToast("Unauthorized");
    return {
      success: false,
      data: null,
    };
  }

  const data: AllowlistToolResponse<T> = await res.json();
  if (data && typeof data === "object" && "error" in data) {
    makeErrorToast(
      typeof data.message === "string" ? data.message : data.message.join(", ")
    );
    return {
      success: false,
      data: null,
    };
  }

  return {
    success: true,
    data: data as T,
  };
};

export async function distributionPlanApiFetch<T>(endpoint: string): Promise<{
  readonly success: boolean;
  readonly data: T | null;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = getAuthJwt();
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }
  try {
    const res = await fetch(`${ALLOWLIST_API_ENDPOINT}${endpoint}`, {
      headers,
    });

    return await handleResponse<T>(res);
  } catch (error) {
    makeErrorToast("Something went wrong, try again");
    return {
      success: false,
      data: null,
    };
  }
}

export const distributionPlanApiPost = async <T>({
  endpoint,
  body,
}: {
  endpoint: string;
  body: any;
}): Promise<{
  readonly success: boolean;
  readonly data: T | null;
}> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = getAuthJwt();
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }
  try {
    const res = await fetch(`${ALLOWLIST_API_ENDPOINT}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    return await handleResponse<T>(res);
  } catch (error) {
    makeErrorToast("Something went wrong, try again");
    return {
      success: false,
      data: null,
    };
  }
};

export const distributionPlanApiDelete = async <T>({
  endpoint,
}: {
  endpoint: string;
}): Promise<{
  readonly success: boolean;
  readonly data: T | null;
}> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const auth = getAuthJwt();
  if (auth) {
    headers["Authorization"] = `Bearer ${auth}`;
  }
  try {
    const res = await fetch(`${ALLOWLIST_API_ENDPOINT}${endpoint}`, {
      method: "DELETE",
      headers,
    });
    try {
      return await handleResponse<T>(res);
    } catch (e) {
      if (res.status === 200 && res.statusText === "OK") {
        return {
          success: true,
          data: null,
        };
      } else {
        makeErrorToast("Something went wrong, try again");
        return {
          success: false,
          data: null,
        };
      }
    }
  } catch (error) {
    makeErrorToast("Something went wrong, try again");
    return {
      success: false,
      data: null,
    };
  }
};
