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
  /** Path and query of the viewer link, without credentials. */
  url: string;
  studyInstanceUIDs: string[];
  stores: Array<{ store: GcpStore; origin: GcpStoreOrigin }>;
  /** The raw `?gcp=` value when it is not a DICOM store path. */
  invalidGcpParam?: string;
};

export const GCP_QUERY_PARAM = 'gcp';

/** Query params that carry credentials and must never be copied or logged. */
const CREDENTIAL_PARAMS = ['token', 'access_token', 'id_token'];

const HEALTHCARE_API_ROOT = 'https://healthcare.googleapis.com/v1';

const STORE_SEGMENTS =
  'projects/([^/?#]+)/locations/([^/?#]+)/datasets/([^/?#]+)/dicomStores/([^/?#]+)';

/**
 * A `?gcp=` value: a store path, relative or on the Healthcare API host,
 * optionally followed by `/dicomWeb`, `/study/<uid>` and so on.
 */
const GCP_PARAM = new RegExp(
  `^(?:https://healthcare\\.googleapis\\.com/v1[^/]*/|/)?${STORE_SEGMENTS}(?:/.*)?$`
);

/** The GCP mode route, possibly under a router basename. */
const GCP_ROUTE = new RegExp(`/${STORE_SEGMENTS}/study/([^/?#]+)`);

/** Decodes a URL path segment, keeping it as is when it is malformed. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch (_error) {
    return segment;
  }
}

const splitUIDs = (values: string[]): string[] =>
  values
    .flatMap(value => value.split(','))
    .map(uid => uid.trim())
    .filter(Boolean);

function toStore(project: string, location: string, dataset: string, dicomStore: string): GcpStore {
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
 * Reads a DICOM store from a `?gcp=` value. Returns null when the value is
 * not a store path. This is the one place that decides what a valid `?gcp=`
 * value is, for the data source and for the diagnostics.
 */
export function parseGcpStore(value: string | null | undefined): GcpStore | null {
  const match = value?.trim().match(GCP_PARAM);
  if (!match) {
    return null;
  }
  const [, project, location, dataset, dicomStore] = match;
  return toStore(project, location, dataset, dicomStore);
}

/** Removes credentials from a query string, leaving the rest of it as written. */
export function withoutCredentials(search: string): string {
  const kept = search
    .replace(/^\?/, '')
    .split('&')
    .filter(part => part && !CREDENTIAL_PARAMS.includes(part.split('=')[0].toLowerCase()));
  return kept.length ? `?${kept.join('&')}` : '';
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
    url: `${pathname}${withoutCredentials(search)}`,
    studyInstanceUIDs: [],
    stores: [],
  };

  const route = pathname.match(GCP_ROUTE)?.slice(1).map(decodeSegment);
  const routeStore = route ? toStore(route[0], route[1], route[2], route[3]) : null;
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

  request.studyInstanceUIDs = [
    ...new Set(
      splitUIDs([
        ...(route ? [route[4]] : []),
        ...query.getAll('StudyInstanceUIDs'),
        ...query.getAll('studyInstanceUIDs'),
      ])
    ),
  ];

  return request;
}

/** True when the link names a GCP store, valid or not. */
export function hasGcpRequest(request: GcpRequest | null | undefined): request is GcpRequest {
  return Boolean(request && (request.stores.length || request.invalidGcpParam));
}
