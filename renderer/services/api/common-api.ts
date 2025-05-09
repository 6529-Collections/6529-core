import Cookies from "js-cookie";
import { API_AUTH_COOKIE } from "../../constants";
import { getAuthJwt } from "../auth/auth.utils";
import { SEIZE_API_URL } from "../../../constants";

const getHeaders = (
  headers?: Record<string, string>,
  contentType: boolean = true
) => {
  const apiAuth = Cookies.get(API_AUTH_COOKIE);
  const walletAuth = getAuthJwt();
  return {
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(apiAuth ? { "x-6529-auth": apiAuth } : {}),
    ...(walletAuth ? { Authorization: `Bearer ${walletAuth}` } : {}),
    ...(headers ?? {}),
  };
};

export const commonApiFetch = async <T, U = Record<string, string>>(param: {
  endpoint: string;
  headers?: Record<string, string>;
  params?: U;
  signal?: AbortSignal;
}): Promise<T> => {
  let url = `${SEIZE_API_URL}/api/${param.endpoint}`;
  if (param.params) {
    const queryParams = new URLSearchParams();
    // Override NIC with CIC
    Object.entries(param.params).forEach(([key, value]: [string, any]) => {
      const newValue = value === "nic" ? "cic" : value;
      queryParams.set(key, newValue);
    });
    url += `?${queryParams.toString()}`;
  }
  const res = await fetch(url, {
    headers: getHeaders(param.headers),
    signal: param.signal,
  });
  if (!res.ok) {
    const body: any = await res.json();
    return new Promise((_, rej) =>
      rej(body?.error ?? res.statusText ?? "Something went wrong")
    );
  }
  return res.json();
};

export const commonApiPost = async <T, U, Z = Record<string, string>>(param: {
  endpoint: string;
  body: T;
  headers?: Record<string, string>;
  params?: Z;
}): Promise<U> => {
  let url = `${SEIZE_API_URL}/api/${param.endpoint}`;
  if (param.params) {
    const queryParams = new URLSearchParams(param.params);
    url += `?${queryParams.toString()}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(param.headers),
    body: JSON.stringify(param.body),
  });
  if (!res.ok) {
    const body: any = await res.json();
    return new Promise((_, rej) =>
      rej(body?.error ?? res.statusText ?? "Something went wrong")
    );
  }
  return res.json();
};

export const commonApiPostWithoutBodyAndResponse = async (param: {
  endpoint: string;
  headers?: Record<string, string>;
}): Promise<void> => {
  let url = `${SEIZE_API_URL}/api/${param.endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(param.headers),
    body: "",
  });
  if (!res.ok) {
    const body: any = await res.json();
    return new Promise((_, rej) =>
      rej(body?.error ?? res.statusText ?? "Something went wrong")
    );
  }
};

export const commonApiDelete = async (param: {
  endpoint: string;
  headers?: Record<string, string>;
}): Promise<void> => {
  await fetch(`${SEIZE_API_URL}/api/${param.endpoint}`, {
    method: "DELETE",
    headers: getHeaders(param.headers),
  });
};

export const commonApiDeleWithBody = async <
  T,
  U,
  Z = Record<string, string>
>(param: {
  endpoint: string;
  body: T;
  headers?: Record<string, string>;
  params?: Z;
}): Promise<U> => {
  let url = `${SEIZE_API_URL}/api/${param.endpoint}`;
  if (param.params) {
    const queryParams = new URLSearchParams(param.params);
    url += `?${queryParams.toString()}`;
  }
  const res = await fetch(url, {
    method: "DELETE",
    headers: getHeaders(param.headers),
    body: JSON.stringify(param.body),
  });
  if (!res.ok) {
    const body: any = await res.json();
    return Promise.reject(
      body?.error ?? res.statusText ?? "Something went wrong"
    );
  }
  return res.json();
};

export const commonApiPut = async <T, U, Z = Record<string, string>>(param: {
  endpoint: string;
  body: T;
  headers?: Record<string, string>;
  params?: Z;
}): Promise<U> => {
  let url = `${SEIZE_API_URL}/api/${param.endpoint}`;
  if (param.params) {
    const queryParams = new URLSearchParams(param.params);
    url += `?${queryParams.toString()}`;
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: getHeaders(param.headers),
    body: JSON.stringify(param.body),
  });
  if (!res.ok) {
    const body: any = await res.json();
    return Promise.reject(
      body?.error ?? res.statusText ?? "Something went wrong"
    );
  }
  return res.json();
};

export const commonApiPostForm = async <U>(param: {
  endpoint: string;
  body: FormData;
  headers?: Record<string, string>;
}): Promise<U> => {
  const res = await fetch(`${SEIZE_API_URL}/api/${param.endpoint}`, {
    method: "POST",
    headers: getHeaders(param.headers, false),
    body: param.body,
  });
  if (!res.ok) {
    const body: any = await res.json();
    return new Promise((_, rej) =>
      rej(body?.error ?? res.statusText ?? "Something went wrong")
    );
  }
  return res.json();
};
