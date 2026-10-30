import {
  getLastRequest,
  initStoreDiagnostics,
  notifyStoreDiagnostics,
  onLeaveViewer,
  rememberRequest,
  signInAgain,
} from './storeDiagnostics';
import { clearStoreChecks } from './storeCheck';

const STORE = 'projects/p/locations/us/datasets/d/dicomStores/s';
const GCP_LINK = `/viewer?StudyInstanceUIDs=1.2.3&gcp=${STORE}`;

const services = () => ({
  uiNotificationService: { show: jest.fn(), hide: jest.fn() },
  userAuthenticationService: {
    getAuthorizationHeader: jest.fn(() => ({ Authorization: 'Bearer t' })),
    getUser: jest.fn(() => null),
    handleUnauthenticated: jest.fn(),
  },
});

function init(url: string, appConfig: Record<string, unknown> = {}) {
  window.history.replaceState(null, '', url);
  const servicesManager = { services: services() };
  initStoreDiagnostics({ servicesManager: servicesManager as never, appConfig });
  return servicesManager.services;
}

beforeEach(() => {
  sessionStorage.clear();
  clearStoreChecks();
  window.history.replaceState(null, '', '/');
  rememberRequest({ pathname: '/', search: '' });
});

describe('the requested link', () => {
  it('is the current URL when it names a GCP store, without credentials', () => {
    init(`${GCP_LINK}&token=secret`);
    expect(getLastRequest()?.url).toBe(GCP_LINK);
  });

  it('survives a reload of the "study not found" page', () => {
    init(GCP_LINK);
    init('/notfoundstudy');
    expect(getLastRequest()?.url).toBe(GCP_LINK);
  });

  it('is the sign-in return link on the callback, with the router basename', () => {
    sessionStorage.setItem(
      'ohif-redirect-to',
      JSON.stringify({ pathname: '/viewer', search: `?StudyInstanceUIDs=1.2.3&gcp=${STORE}` })
    );
    init('/v3/callback', { routerBasename: '/v3', oidc: [{ redirect_uri: '/v3/callback' }] });
    expect(getLastRequest()?.url).toBe(`/v3${GCP_LINK}`);
  });

  it('ignores an old sign-in return link outside the callback', () => {
    sessionStorage.setItem(
      'ohif-redirect-to',
      JSON.stringify({ pathname: '/viewer', search: `?gcp=${STORE}` })
    );
    init('/viewer?StudyInstanceUIDs=9.9', { oidc: [{ redirect_uri: '/callback' }] });
    expect(getLastRequest()).toBeNull();
  });

  it('is forgotten when the viewer is left for another page', () => {
    init(GCP_LINK);
    window.history.replaceState(null, '', '/');
    onLeaveViewer();
    expect(getLastRequest()).toBeNull();
  });

  it('is kept when the viewer redirects to "study not found"', () => {
    init(GCP_LINK);
    window.history.replaceState(null, '', '/notfoundstudy');
    onLeaveViewer();
    expect(getLastRequest()?.url).toBe(GCP_LINK);
  });

  it('can be turned off', () => {
    init(GCP_LINK, { gcpStoreDiagnostics: { enabled: false } });
    expect(getLastRequest()).toBeNull();
  });
});

describe('signInAgain', () => {
  it('returns to the requested link, router-relative, not the current page', () => {
    const { userAuthenticationService } = init(GCP_LINK.replace('/viewer', '/v3/viewer'), {
      routerBasename: '/v3',
    });
    window.history.replaceState(null, '', '/v3/notfoundstudy');
    sessionStorage.setItem('ohif-redirect-to', JSON.stringify({ pathname: '/notfoundstudy' }));

    signInAgain();

    expect(JSON.parse(sessionStorage.getItem('ohif-redirect-to'))).toEqual({
      pathname: '/viewer',
      search: `?StudyInstanceUIDs=1.2.3&gcp=${STORE}`,
    });
    expect(userAuthenticationService.handleUnauthenticated).toHaveBeenCalled();
  });
});

describe('notifyStoreDiagnostics', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows one notification per problem, and none after the viewer is left', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 403,
      ok: false,
      json: () => Promise.resolve({ error: { message: 'denied' } }),
    }) as never;

    const { uiNotificationService } = init(GCP_LINK, { oidc: [{}] });
    await notifyStoreDiagnostics();
    expect(uiNotificationService.show).toHaveBeenCalledTimes(1);
    expect(uiNotificationService.show.mock.calls[0][0]).toMatchObject({
      type: 'error',
      duration: Infinity,
      title: 'No access to GCP DICOM store',
    });

    clearStoreChecks();
    uiNotificationService.show.mockClear();
    const pending = notifyStoreDiagnostics();
    onLeaveViewer();
    await pending;
    expect(uiNotificationService.show).not.toHaveBeenCalled();
    expect(uiNotificationService.hide).toHaveBeenCalled();
  });
});
