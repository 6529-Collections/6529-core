import Cookies from "js-cookie";
import { API_AUTH_COOKIE } from "../../constants";
import { getAuthJwt } from "../auth/auth.utils";
import { SEIZE_API_URL } from "../../../constants";

type QueryParams =
  | string
  | Record<string, string>
  | string[][]
  | URLSearchParams;

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

export const commonApiFetch = async <
  T,
  U extends QueryParams = Record<string, string>
>(param: {
  endpoint: string;
  headers?: Record<string, string>;
  params?: U;
}): Promise<T> => {
  let url = `${SEIZE_API_URL}/api/${param.endpoint}`;
  if (param.params) {
    const queryParams = new URLSearchParams(param.params);
    url += `?${queryParams.toString()}`;
  }
  const res = await fetch(url, {
    headers: getHeaders(param.headers),
  });
  if (!res.ok) {
    const body: any = await res.json();
    return new Promise((_, rej) =>
      rej(body?.error ?? res.statusText ?? "Something went wrong")
    );
  }
  return res.json();
};

export const commonApiPost = async <
  T,
  U,
  Z extends QueryParams = Record<string, string>
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

export const commonApiPut = async <
  T,
  U,
  Z extends QueryParams = Record<string, string>
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

export const commonApiDelete = async (param: {
  endpoint: string;
  headers?: Record<string, string>;
}): Promise<void> => {
  await fetch(`${SEIZE_API_URL}/api/${param.endpoint}`, {
    method: "DELETE",
    headers: getHeaders(param.headers),
  });
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
