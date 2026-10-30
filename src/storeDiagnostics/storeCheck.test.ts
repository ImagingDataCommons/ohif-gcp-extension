import { parseGcpStore } from './gcpStores';
import { checkStore, checkStoreOnce, clearStoreChecks, statusFromHttp } from './storeCheck';

const store = parseGcpStore('projects/p/locations/us/datasets/d/dicomStores/s');
const STUDY = '1.2.3';

const respond = (status: number, body?: unknown) =>
  jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  });

describe('statusFromHttp', () => {
  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [429, 'unavailable'],
    [503, 'unavailable'],
    [400, 'failed'],
  ])('maps %i to %s', (httpStatus, status) => {
    expect(statusFromHttp(httpStatus)).toBe(status);
  });
});

describe('checkStore', () => {
  it('searches the store for the study with the sign-in token', async () => {
    const fetchImpl = respond(200, [{}]);
    const result = await checkStore(store, STUDY, {
      fetchImpl,
      getAuthorizationHeader: () => ({ Authorization: 'Bearer t' }),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${store.dicomWebRoot}/studies?StudyInstanceUID=${STUDY}&limit=1`,
      { headers: { Accept: 'application/dicom+json', Authorization: 'Bearer t' } }
    );
    expect(result).toMatchObject({ status: 'ok', httpStatus: 200, studyInstanceUID: STUDY });
  });

  it('reports an empty store for an empty list or 204', async () => {
    expect((await checkStore(store, STUDY, { fetchImpl: respond(200, []) })).status).toBe('empty');
    expect((await checkStore(store, STUDY, { fetchImpl: respond(204) })).status).toBe('empty');
  });

  it('keeps the reason Google Cloud gives for an error', async () => {
    const message = "Permission 'healthcare.dicomStores.dicomWebRead' denied on resource";
    const result = await checkStore(store, STUDY, {
      fetchImpl: respond(403, { error: { code: 403, message, status: 'PERMISSION_DENIED' } }),
    });
    expect(result).toMatchObject({ status: 'forbidden', httpStatus: 403, gcpMessage: message });

    const list = await checkStore(store, STUDY, {
      fetchImpl: respond(404, [{ error: { message: 'gone' } }]),
    });
    expect(list).toMatchObject({ status: 'notFound', gcpMessage: 'gone' });
  });

  it('copes with error responses without a JSON body', async () => {
    const result = await checkStore(store, STUDY, { fetchImpl: respond(401) });
    expect(result.status).toBe('unauthenticated');
    expect(result.gcpMessage).toBeUndefined();
  });

  it('reports a network failure when there is no response', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await checkStore(store, STUDY, { fetchImpl })).status).toBe('network');
  });
});

describe('checkStoreOnce', () => {
  afterEach(clearStoreChecks);

  it('sends one request per store and study', async () => {
    const fetchImpl = respond(200, [{}]);
    await Promise.all([
      checkStoreOnce(store, STUDY, { fetchImpl }),
      checkStoreOnce(store, STUDY, { fetchImpl }),
      checkStoreOnce(store, '4.5', { fetchImpl }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('checks again after the sign-in token changes', async () => {
    const fetchImpl = respond(401);
    let token = 'Bearer old';
    const getAuthorizationHeader = () => ({ Authorization: token });

    await checkStoreOnce(store, STUDY, { fetchImpl, getAuthorizationHeader });
    await checkStoreOnce(store, STUDY, { fetchImpl, getAuthorizationHeader });
    token = 'Bearer new';
    await checkStoreOnce(store, STUDY, { fetchImpl, getAuthorizationHeader });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
