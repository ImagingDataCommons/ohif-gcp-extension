import type { GcpStore } from './gcpStores';

/**
 * Outcome of asking a GCP DICOM store for a study:
 * - ok: the store holds the study
 * - empty: the store answered but does not hold the study
 * - unauthenticated: 401, no or expired Google sign-in
 * - forbidden: 403, the account lacks access (GCP also answers 403 for stores that do not exist)
 * - notFound: 404, the project, dataset or store does not exist
 * - network: no HTTP response at all (offline, VPN, firewall or CORS)
 * - unavailable: 429 or 5xx, quota or service trouble
 * - failed: any other HTTP error (400 usually means a malformed study UID)
 */
export type StoreCheckStatus =
  | 'ok'
  | 'empty'
  | 'unauthenticated'
  | 'forbidden'
  | 'notFound'
  | 'network'
  | 'unavailable'
  | 'failed';

export type StoreCheck = {
  store: GcpStore;
  studyInstanceUID: string;
  status: StoreCheckStatus;
  httpStatus?: number;
  /** The reason Google Cloud gave in the error body, when there is one. */
  gcpMessage?: string;
  checkedAt: string;
};

export type StoreCheckOptions = {
  getAuthorizationHeader?: () => { Authorization?: string } | undefined;
  fetchImpl?: typeof fetch;
};

/** Maps an HTTP status to a check outcome. */
export function statusFromHttp(httpStatus: number): StoreCheckStatus {
  if (httpStatus === 401) {
    return 'unauthenticated';
  }
  if (httpStatus === 403) {
    return 'forbidden';
  }
  if (httpStatus === 404) {
    return 'notFound';
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    return 'unavailable';
  }
  return 'failed';
}

/** Reads `error.message` from a Google API error body. */
async function readGcpMessage(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json();
    const error = Array.isArray(body) ? body[0]?.error : body?.error;
    return typeof error?.message === 'string' ? error.message : undefined;
  } catch (_error) {
    return undefined;
  }
}

/**
 * Asks one store whether it holds the study, the same study search OHIF uses
 * to validate a link. A missing study answers 200 with an empty list, so a
 * 403 or 404 points at access or the store, never at the study.
 */
export async function checkStore(
  store: GcpStore,
  studyInstanceUID: string,
  { getAuthorizationHeader, fetchImpl = fetch }: StoreCheckOptions = {}
): Promise<StoreCheck> {
  const result = { store, studyInstanceUID, checkedAt: new Date().toISOString() };
  const url = `${store.dicomWebRoot}/studies?StudyInstanceUID=${encodeURIComponent(studyInstanceUID)}&limit=1`;
  const headers: Record<string, string> = { Accept: 'application/dicom+json' };
  const authorization = getAuthorizationHeader?.()?.Authorization;
  if (authorization) {
    headers.Authorization = authorization;
  }

  let response: Response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (_error) {
    return { ...result, status: 'network' };
  }

  if (response.status === 204) {
    return { ...result, status: 'empty', httpStatus: 204 };
  }

  if (!response.ok) {
    return {
      ...result,
      status: statusFromHttp(response.status),
      httpStatus: response.status,
      gcpMessage: await readGcpMessage(response),
    };
  }

  let series: unknown;
  try {
    series = await response.json();
  } catch (_error) {
    series = [];
  }

  return {
    ...result,
    status: Array.isArray(series) && series.length ? 'ok' : 'empty',
    httpStatus: response.status,
  };
}

const pendingChecks = new Map<string, Promise<StoreCheck>>();

/**
 * Checks a store once per sign-in, so the viewer and the "study not found"
 * page share one request. A new token (sign-in or silent renewal) checks
 * again, so an expired sign-in is not reported after it was renewed.
 */
export function checkStoreOnce(
  store: GcpStore,
  studyInstanceUID: string,
  options: StoreCheckOptions = {}
): Promise<StoreCheck> {
  const token = options.getAuthorizationHeader?.()?.Authorization ?? '';
  const key = `${store.path}|${studyInstanceUID}|${token}`;
  if (!pendingChecks.has(key)) {
    const check = checkStore(store, studyInstanceUID, options);
    pendingChecks.set(key, check);
    /** Network and service trouble can pass, so those results are checked again next time. */
    check.then(({ status }) => {
      if (status === 'network' || status === 'unavailable') {
        pendingChecks.delete(key);
      }
    });
  }
  return pendingChecks.get(key);
}

/** For tests. */
export function clearStoreChecks(): void {
  pendingChecks.clear();
}
