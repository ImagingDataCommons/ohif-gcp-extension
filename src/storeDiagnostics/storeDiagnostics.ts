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

const NOT_FOUND_STUDY_PATH = '/notfoundstudy';

let services: Services | null = null;
let appConfig: Record<string, unknown> = {};
let lastRequest: GcpRequest | null = null;

const isEnabled = () =>
  (appConfig.gcpStoreDiagnostics as StoreDiagnosticsConfig | undefined)?.enabled !== false;

/**
 * Reads the viewer link to diagnose: the current URL, or after a sign-in
 * redirect the link OHIF stored to come back to.
 */
function readInitialLocation(): { pathname: string; search: string } {
  const current = { pathname: window.location.pathname, search: window.location.search };
  if (hasGcpRequest(getGcpRequest(current))) {
    return current;
  }

  try {
    const stored = JSON.parse(sessionStorage.getItem('ohif-redirect-to') || 'null');
    if (stored?.pathname) {
      return { pathname: stored.pathname, search: stored.search || '' };
    }
  } catch (_error) {
    /** No usable redirect, use the current URL. */
  }
  return current;
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
  rememberRequest(readInitialLocation());
}

/**
 * Records the viewer link being opened. OHIF drops the link when it
 * redirects to the "study not found" page, so the page reads it from here.
 */
export function rememberRequest(location: { pathname: string; search: string }): void {
  if (location.pathname.endsWith(NOT_FOUND_STUDY_PATH)) {
    return;
  }
  const request = getGcpRequest(location);
  lastRequest = hasGcpRequest(request) ? request : null;
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

export function signInAgain(): void {
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
  services?.uiNotificationService?.show({
    id: toastId(key),
    title: problem.title,
    message: `${problem.message} ${problem.hint}`,
    type: problem.type,
    duration: problem.type === 'error' ? Infinity : 15000,
    action: problem.signIn
      ? { label: 'Sign in again', onClick: signInAgain }
      : { label: 'Copy details', onClick: () => copySupportDetails(request, checks) },
  });
}

/** Lists the problems found for a link, paired with the check behind each. */
export function getProblems(
  request: GcpRequest,
  checks: StoreCheck[]
): Array<{ key: string; problem: StoreProblem; check?: StoreCheck }> {
  const userEmail = getUserEmail();
  const problems: Array<{ key: string; problem: StoreProblem; check?: StoreCheck }> = [];

  if (request.invalidGcpParam) {
    problems.push({
      key: INVALID_PARAM_KEY,
      problem: describeInvalidGcpParam(request.invalidGcpParam),
    });
  }
  checks.forEach(check => {
    const problem = describeStoreCheck(check, userEmail);
    if (problem) {
      problems.push({ key: checkKey(check), problem, check });
    }
  });
  return problems;
}

/** Dismisses the toasts for a link, used once a page shows the same problems. */
export function hideStoreToasts(request: GcpRequest, checks: StoreCheck[]): void {
  [INVALID_PARAM_KEY, ...checks.map(checkKey)].forEach(key =>
    services?.uiNotificationService?.hide?.(toastId(key))
  );
}

/**
 * Checks the GCP stores in the current link and tells the user about each
 * one that cannot be read or lacks the study. Runs on every mode enter, so it
 * covers `?gcp=` in any mode as well as the GCP mode route.
 */
export async function notifyStoreDiagnostics(): Promise<void> {
  rememberRequest({ pathname: window.location.pathname, search: window.location.search });
  const request = getLastRequest();
  if (!request) {
    return;
  }

  const checks = await runStoreChecks(request);
  const problems = getProblems(request, checks);
  problems.forEach(({ problem, check }) => logProblem(problem, check));

  /** The "study not found" page shows these itself. */
  if (window.location.pathname.endsWith(NOT_FOUND_STUDY_PATH)) {
    return;
  }
  problems.forEach(({ key, problem }) => showProblem(key, problem, request, checks));
}
