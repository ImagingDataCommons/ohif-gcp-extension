/** A Google Cloud Healthcare API DICOM store, as named in a viewer link. */
export type GcpStore = {
  project: string;
  location: string;
  dataset: string;
  dicomStore: string;
  /** `projects/<p>/locations/<l>/datasets/<d>/dicomStores/<s>` */
  path: string;
  /** DICOMweb root of the store. */
  dicomWebRoot: string;
};

/** Where a store came from in the viewer link. */
export type GcpStoreOrigin = 'query' | 'route';

/** The GCP stores and studies a viewer link asks for. */
export type GcpRequest = {
  /** Path and query of the viewer link, kept for support details. */
  url: string;
  studyInstanceUIDs: string[];
  stores: Array<{ store: GcpStore; origin: GcpStoreOrigin }>;
  /** The raw `?gcp=` value when it is not a valid DICOM store path. */
  invalidGcpParam?: string;
};

export const GCP_QUERY_PARAM = 'gcp';

const HEALTHCARE_API_ROOT = 'https://healthcare.googleapis.com/v1';

const STORE_PATH =
  /projects\/([^/?#]+)\/locations\/([^/?#]+)\/datasets\/([^/?#]+)\/dicomStores\/([^/?#]+)/;

const ROUTE_STUDY = /\/dicomStores\/[^/]+\/study\/([^/?#]+)/;

const splitUIDs = (values: string[]): string[] =>
  values
    .flatMap(value => decodeURIComponent(value).split(','))
    .map(uid => uid.trim())
    .filter(Boolean);

/**
 * Reads a DICOM store from a `?gcp=` value, a GCP mode route path or a
 * DICOMweb root. Returns null when no store path is present.
 */
export function parseGcpStore(value: string | null | undefined): GcpStore | null {
  const match = value?.match(STORE_PATH);
  if (!match) {
    return null;
  }

  const [, project, location, dataset, dicomStore] = match.map(part => decodeURIComponent(part));
  const path = `projects/${project}/locations/${location}/datasets/${dataset}/dicomStores/${dicomStore}`;

  return {
    project,
    location,
    dataset,
    dicomStore,
    path,
    dicomWebRoot: `${HEALTHCARE_API_ROOT}/${path}/dicomWeb`,
  };
}

/**
 * Lists the GCP stores and studies a viewer link asks for: the store in
 * `?gcp=` and, on the GCP mode route, the store in the path.
 */
export function getGcpRequest({
  pathname,
  search,
}: {
  pathname: string;
  search: string;
}): GcpRequest {
  const query = new URLSearchParams(search);
  const request: GcpRequest = {
    url: `${pathname}${search}`,
    studyInstanceUIDs: [],
    stores: [],
  };

  const routeStore = ROUTE_STUDY.test(pathname) ? parseGcpStore(pathname) : null;
  if (routeStore) {
    request.stores.push({ store: routeStore, origin: 'route' });
  }

  const gcpParam = query.get(GCP_QUERY_PARAM);
  if (gcpParam) {
    const queryStore = parseGcpStore(gcpParam);
    if (!queryStore) {
      request.invalidGcpParam = gcpParam;
    } else if (queryStore.path !== routeStore?.path) {
      request.stores.push({ store: queryStore, origin: 'query' });
    }
  }

  const routeStudies = splitUIDs([pathname.match(ROUTE_STUDY)?.[1]].filter(Boolean));
  const queryStudies = splitUIDs([
    ...query.getAll('StudyInstanceUIDs'),
    ...query.getAll('studyInstanceUIDs'),
  ]);
  request.studyInstanceUIDs = [...new Set([...routeStudies, ...queryStudies])];

  return request;
}

/** True when the link names a GCP store, valid or not. */
export function hasGcpRequest(request: GcpRequest | null | undefined): request is GcpRequest {
  return Boolean(request && (request.stores.length || request.invalidGcpParam));
}
