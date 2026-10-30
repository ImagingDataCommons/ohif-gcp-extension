import { GcpRequest, getGcpRequest, hasGcpRequest } from './gcpStores';
import { StoreCheck, checkStoreOnce } from './storeCheck';
import {
  StoreProblem,
  describeInvalidGcpParam,
  describeStoreCheck,
  formatSupportDetails,
} from './messages';

export type StoreDiagnosticsConfig = {
  enabled?: boolean;
};

type Services = AppTypes.ServicesManager['services'];
type Location = { pathname: string; search: string };

const NOT_FOUND_STUDY_PATH = '/notfoundstudy';

/** This extension's record of the link being diagnosed (full path, no credentials). */
const REQUEST_STORAGE_KEY = 'gcp-store-diagnostics-request';

/** Where OHIF's sign-in keeps the router-relative link to return to. */
const OHIF_REDIRECT_KEY = 'ohif-redirect-to';

let services: Services | null = null;
let appConfig: Record<string, unknown> = {};
let lastRequest: GcpRequest | null = null;

/** Bumped on every mode enter and exit, so late results of a left viewer are dropped. */
let generation = 0;

const isEnabled = () =>
  (appConfig.gcpStoreDiagnostics as StoreDiagnosticsConfig | undefined)?.enabled !== false;

const routerBasename = () => String(appConfig.routerBasename || '').replace(/\/$/, '');

const isNotFoundPage = (pathname: string) => pathname.endsWith(NOT_FOUND_STUDY_PATH);

/** True when the viewer offers Google sign-in, so asking the user to sign in makes sense. */
export function canSignIn(): boolean {
  const { oidc } = appConfig as { oidc?: unknown };
  return Array.isArray(oidc) ? oidc.length > 0 : Boolean(oidc);
}

function readStorage(key: string): Location | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    return typeof value?.pathname === 'string'
      ? { pathname: value.pathname, search: value.search || '' }
      : null;
  } catch (_error) {
    return null;
  }
}

function writeStorage(key: string, value: Location | null): void {
  try {
    if (value) {
      sessionStorage.setItem(key, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch (_error) {
    /** Storage can be unavailable (private mode); the in-memory record still works. */
  }
}

/** True on the sign-in callback page, where the link to diagnose is the one OHIF returns to. */
function isSignInCallback(pathname: string): boolean {
  const oidc = (appConfig as { oidc?: Array<{ redirect_uri?: string }> }).oidc;
  const redirectUri = Array.isArray(oidc) ? oidc[0]?.redirect_uri : undefined;
  if (!redirectUri) {
    return false;
  }
  return pathname.endsWith(new URL(redirectUri, window.location.origin).pathname);
}

/**
 * Picks the link to diagnose when the app starts:
 * - the current URL when it names a GCP store;
 * - this extension's record on a reload of the "study not found" page;
 * - on the sign-in callback, the link OHIF returns to (router-relative, so
 *   the basename is put back).
 */
function readInitialRequest(): GcpRequest | null {
  const { pathname, search } = window.location;
  const current = getGcpRequest({ pathname, search });
  if (hasGcpRequest(current)) {
    return current;
  }

  if (isNotFoundPage(pathname)) {
    const saved = readStorage(REQUEST_STORAGE_KEY);
    return saved ? getGcpRequest(saved) : null;
  }

  if (isSignInCallback(pathname)) {
    const redirect = readStorage(OHIF_REDIRECT_KEY);
    if (redirect) {
      const basename = routerBasename();
      const fullPath =
        basename && !redirect.pathname.startsWith(`${basename}/`)
          ? `${basename}${redirect.pathname}`
          : redirect.pathname;
      const request = getGcpRequest({ pathname: fullPath, search: redirect.search });
      return hasGcpRequest(request) ? request : null;
    }
  }
  return null;
}

function setRequest(request: GcpRequest | null): void {
  lastRequest = request;
  const url = request ? new URL(request.url, window.location.origin) : null;
  writeStorage(REQUEST_STORAGE_KEY, url ? { pathname: url.pathname, search: url.search } : null);
}

/**
 * Keeps the services and the requested link for later. Called from
 * `preRegistration`, before any route mounts.
 */
export function initStoreDiagnostics({
  servicesManager,
  appConfig: config,
}: {
  servicesManager: AppTypes.ServicesManager;
  appConfig: Record<string, unknown>;
}): void {
  services = servicesManager.services;
  appConfig = config || {};
  try {
    setRequest(readInitialRequest());
  } catch (error) {
    console.warn('[GCP] Could not read the requested link', error);
  }
}

/**
 * Records the viewer link being opened. OHIF drops the link when it
 * redirects to the "study not found" page, so the page reads it from here.
 */
export function rememberRequest(location: Location): void {
  if (isNotFoundPage(location.pathname)) {
    return;
  }
  const request = getGcpRequest(location);
  setRequest(hasGcpRequest(request) ? request : null);
}

export function getLastRequest(): GcpRequest | null {
  return isEnabled() ? lastRequest : null;
}

export function shouldShowStudyList(): boolean {
  return Boolean(appConfig.showStudyList);
}

export function getUserEmail(): string | undefined {
  try {
    const user = services?.userAuthenticationService?.getUser?.();
    return user?.profile?.email;
  } catch (_error) {
    return undefined;
  }
}

/** Checks every store in the link for every study in it. */
export function runStoreChecks(request: GcpRequest): Promise<StoreCheck[]> {
  const { userAuthenticationService } = services ?? {};
  const getAuthorizationHeader = () => userAuthenticationService?.getAuthorizationHeader?.();

  return Promise.all(
    request.stores.flatMap(({ store }) =>
      request.studyInstanceUIDs.map(studyInstanceUID =>
        checkStoreOnce(store, studyInstanceUID, { getAuthorizationHeader })
      )
    )
  );
}

/**
 * Starts Google sign-in and comes back to the requested link. OHIF would
 * otherwise return to the page the user is on, which may be "study not found".
 */
export function signInAgain(request: GcpRequest | null = lastRequest): void {
  if (request) {
    const url = new URL(request.url, window.location.origin);
    const basename = routerBasename();
    const pathname =
      basename && url.pathname.startsWith(`${basename}/`)
        ? url.pathname.slice(basename.length)
        : url.pathname;
    writeStorage(OHIF_REDIRECT_KEY, { pathname, search: url.search });
  }
  services?.userAuthenticationService?.handleUnauthenticated?.();
}

/** Copies the support report to the clipboard and confirms it. */
export async function copySupportDetails(request: GcpRequest, checks: StoreCheck[]): Promise<void> {
  const details = formatSupportDetails({ request, checks, userEmail: getUserEmail() });
  console.info(`[GCP] Store check details:\n${details}`);

  try {
    await navigator.clipboard.writeText(details);
    services?.uiNotificationService?.show({
      title: 'Details copied',
      message: 'Paste them into your message to the person who shared the link.',
      type: 'success',
    });
  } catch (_error) {
    services?.uiNotificationService?.show({
      title: 'Could not copy details',
      message: 'The details were written to the browser console instead.',
      type: 'warning',
    });
  }
}

const toastId = (key: string) => `gcp-store-diagnostics-${key}`;

const INVALID_PARAM_KEY = 'invalid-gcp-param';

const checkKey = (check: StoreCheck) => `${check.store.path}-${check.studyInstanceUID}`;

/** Ids of the toasts currently shown, so they can be hidden when the viewer is left. */
const shownToastIds = new Set<string>();

function logProblem(problem: StoreProblem, check?: StoreCheck) {
  const where = check ? ` [${check.store.path}, study ${check.studyInstanceUID}]` : '';
  const gcp = check?.gcpMessage ? ` Google Cloud: ${check.gcpMessage}` : '';
  console.warn(`[GCP] ${problem.title}${where}: ${problem.message}${gcp}`);
}

function showProblem(
  key: string,
  problem: StoreProblem,
  request: GcpRequest,
  checks: StoreCheck[]
) {
  const id = toastId(key);
  shownToastIds.add(id);
  services?.uiNotificationService?.show({
    id,
    title: problem.title,
    message: `${problem.message} ${problem.hint}`,
    type: problem.type,
    duration: problem.type === 'error' ? Infinity : 15000,
    action: problem.signIn
      ? { label: 'Sign in again', onClick: () => signInAgain(request) }
      : {
          /**
           * Also closes the toast: OHIF's toaster has no close button, so the
           * action is how an error that stays open gets dismissed.
           */
          label: 'Copy details',
          onClick: () => copySupportDetails(request, checks),
        },
  });
}

/** Lists the problems found for a link, paired with the check behind each. */
export function getProblems(
  request: GcpRequest,
  checks: StoreCheck[]
): Array<{ key: string; problem: StoreProblem; check?: StoreCheck }> {
  const options = { userEmail: getUserEmail(), canSignIn: canSignIn() };
  const problems: Array<{ key: string; problem: StoreProblem; check?: StoreCheck }> = [];

  if (request.invalidGcpParam) {
    problems.push({
      key: INVALID_PARAM_KEY,
      problem: describeInvalidGcpParam(request.invalidGcpParam),
    });
  }
  checks.forEach(check => {
    const problem = describeStoreCheck(check, options);
    if (problem) {
      problems.push({ key: checkKey(check), problem, check });
    }
  });
  return problems;
}

/** Dismisses the toasts shown for the viewer, e.g. once a page shows the same problems. */
export function hideStoreToasts(): void {
  shownToastIds.forEach(id => services?.uiNotificationService?.hide?.(id));
  shownToastIds.clear();
}

/**
 * Checks the GCP stores in the current link and tells the user about each
 * one that cannot be read or lacks the study. Runs on every mode enter, so it
 * covers `?gcp=` in any mode as well as the GCP mode route.
 */
export async function notifyStoreDiagnostics(): Promise<void> {
  const current = ++generation;
  try {
    rememberRequest({ pathname: window.location.pathname, search: window.location.search });
    const request = getLastRequest();
    if (!request) {
      return;
    }

    const checks = await runStoreChecks(request);
    if (current !== generation) {
      return;
    }
    const problems = getProblems(request, checks);
    problems.forEach(({ problem, check }) => logProblem(problem, check));
    /**
     * A study missing from a store is only worth a notification when nothing
     * loads, which the "study not found" page covers. In the viewer another
     * source has the study (e.g. IDC for a multi-study ?gcp= link).
     */
    problems
      .filter(({ check }) => check?.status !== 'empty')
      .forEach(({ key, problem }) => showProblem(key, problem, request, checks));
  } catch (error) {
    console.warn('[GCP] Store diagnostics failed', error);
  }
}

/** Forgets the link once the user leaves the "study not found" page. */
export function onLeaveNotFoundPage(): void {
  if (!isNotFoundPage(window.location.pathname)) {
    setRequest(null);
  }
}

/**
 * Drops pending results and hides the toasts when the viewer is left. On a
 * redirect to "study not found" the link is kept for that page; anywhere else
 * it is forgotten, so a later page is never explained with an old link.
 */
export function onLeaveViewer(): void {
  generation++;
  hideStoreToasts();
  if (!isNotFoundPage(window.location.pathname)) {
    setRequest(null);
  }
}
