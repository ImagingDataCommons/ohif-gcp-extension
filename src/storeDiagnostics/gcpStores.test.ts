import { getGcpRequest, hasGcpRequest, parseGcpStore } from './gcpStores';

const STORE = 'projects/p/locations/us/datasets/d/dicomStores/s';
const STUDY = '1.2.3';

describe('parseGcpStore', () => {
  it('reads relative paths, full URLs and DICOMweb roots', () => {
    [
      STORE,
      `/${STORE}`,
      `https://healthcare.googleapis.com/v1/${STORE}`,
      `https://healthcare.googleapis.com/v1/${STORE}/dicomWeb`,
      `/${STORE}/study/${STUDY}`,
    ].forEach(value => {
      expect(parseGcpStore(value)).toEqual({
        project: 'p',
        location: 'us',
        dataset: 'd',
        dicomStore: 's',
        path: STORE,
        dicomWebRoot: `https://healthcare.googleapis.com/v1/${STORE}/dicomWeb`,
      });
    });
  });

  it('returns null without a store path', () => {
    expect(parseGcpStore('projects/p/datasets/d')).toBeNull();
    expect(parseGcpStore('')).toBeNull();
    expect(parseGcpStore(undefined)).toBeNull();
  });
});

describe('getGcpRequest', () => {
  it('reads the store and studies from ?gcp=', () => {
    const request = getGcpRequest({
      pathname: '/viewer',
      search: `?StudyInstanceUIDs=${STUDY},4.5&gcp=${encodeURIComponent(STORE)}`,
    });
    expect(request.stores).toEqual([{ store: parseGcpStore(STORE), origin: 'query' }]);
    expect(request.studyInstanceUIDs).toEqual([STUDY, '4.5']);
    expect(request.url).toBe(
      `/viewer?StudyInstanceUIDs=${STUDY},4.5&gcp=${encodeURIComponent(STORE)}`
    );
  });

  it('reads the store and study from the GCP mode route', () => {
    const request = getGcpRequest({ pathname: `/${STORE}/study/${STUDY}/series/9.9`, search: '' });
    expect(request.stores).toEqual([{ store: parseGcpStore(STORE), origin: 'route' }]);
    expect(request.studyInstanceUIDs).toEqual([STUDY]);
  });

  it('lists a route store and a different ?gcp= store once each', () => {
    const other = 'projects/p/locations/us/datasets/d/dicomStores/other';
    const request = getGcpRequest({
      pathname: `/${STORE}/study/${STUDY}`,
      search: `?gcp=${other}`,
    });
    expect(request.stores.map(({ store, origin }) => [store.dicomStore, origin])).toEqual([
      ['s', 'route'],
      ['other', 'query'],
    ]);

    const same = getGcpRequest({ pathname: `/${STORE}/study/${STUDY}`, search: `?gcp=${STORE}` });
    expect(same.stores).toHaveLength(1);
  });

  it('keeps an invalid ?gcp= value', () => {
    const request = getGcpRequest({ pathname: '/viewer', search: '?gcp=not-a-store' });
    expect(request.invalidGcpParam).toBe('not-a-store');
    expect(request.stores).toEqual([]);
    expect(hasGcpRequest(request)).toBe(true);
  });

  it('is empty for links without a GCP store', () => {
    expect(
      hasGcpRequest(getGcpRequest({ pathname: '/viewer', search: `?StudyInstanceUIDs=${STUDY}` }))
    ).toBe(false);
  });
});
