import type { ModeSelectorCustomization } from './modeSelectorCustomization.types';

const GCP_HEALTHCARE_PATH =
  /\/projects\/[^/]+\/locations\/[^/]+\/datasets\/[^/]+\/dicomStores\/[^/]+\/study\//i;

const GCP_HEALTHCARE_PATH_WITH_SERIES =
  /\/projects\/[^/]+\/locations\/[^/]+\/datasets\/[^/]+\/dicomStores\/[^/]+\/study\/[^/]+\/series\//i;

function isHealthcareViewerPath(pathname: string): boolean {
  return GCP_HEALTHCARE_PATH.test(pathname);
}

function isMultisegmentModeRoute(routeName?: string): boolean {
  return Boolean(routeName?.includes('/'));
}

function extractStudyInstanceUIDsFromPath(pathname: string): string[] {
  const match = pathname.match(/\/study\/([^/]+)(?:\/series\/[^/]+)?\/?$/i);
  if (!match?.[1]) {
    return [];
  }

  return decodeURIComponent(match[1])
    .split(',')
    .map(uid => uid.trim())
    .filter(Boolean);
}

/**
 * Extracts SeriesInstanceUIDs from GCP Healthcare API paths.
 * Supports paths like: /projects/.../dicomStores/.../study/<studyUID>/series/<seriesUID>
 */
function extractSeriesInstanceUIDsFromPath(pathname: string): string[] {
  const match = pathname.match(/\/series\/([^/]+)\/?$/i);
  if (!match?.[1]) {
    return [];
  }

  return decodeURIComponent(match[1])
    .split(',')
    .map(uid => uid.trim())
    .filter(Boolean);
}

/**
 * Extracts SeriesInstanceUIDs from query parameters.
 * Supports: SeriesInstanceUIDs, seriesInstanceUIDs, initialSeriesInstanceUID
 */
function extractSeriesInstanceUIDsFromQuery(search: string): string[] {
  const params = new URLSearchParams(search);
  return [
    ...params.getAll('SeriesInstanceUIDs'),
    ...params.getAll('seriesInstanceUIDs'),
    ...params.getAll('initialSeriesInstanceUID'),
  ]
    .flatMap(uid => uid.split(','))
    .map(uid => uid.trim())
    .filter(Boolean);
}

function isLeavingHealthcareViewer(pathname: string, search: string): boolean {
  if (isHealthcareViewerPath(pathname)) {
    return true;
  }

  return new URLSearchParams(search).has('gcp');
}

const modeSelectorCustomization: ModeSelectorCustomization = {
  resolveStudyUidsForNavigation({
    studyInstanceUIDsFromViewer,
    pathname,
  }: {
    studyInstanceUIDsFromViewer?: string[];
    pathname: string;
    search: string;
  }) {
    if (studyInstanceUIDsFromViewer?.length) {
      return studyInstanceUIDsFromViewer;
    }

    const fromPath = extractStudyInstanceUIDsFromPath(pathname);
    return fromPath.length > 0 ? fromPath : undefined;
  },

  /**
   * Resolves SeriesInstanceUIDs for navigation from path or query parameters.
   * Supports GCP Healthcare API series paths and initialSeriesInstanceUID query param.
   */
  resolveSeriesUidsForNavigation({
    pathname,
    search,
  }: {
    pathname: string;
    search: string;
  }): string[] | undefined {
    /** First try to extract from query params (initialSeriesInstanceUID, SeriesInstanceUIDs) */
    const fromQuery = extractSeriesInstanceUIDsFromQuery(search);
    if (fromQuery.length > 0) {
      return fromQuery;
    }

    /** Then try to extract from GCP Healthcare API path */
    const fromPath = extractSeriesInstanceUIDsFromPath(pathname);
    return fromPath.length > 0 ? fromPath : undefined;
  },
  augmentBuildModeSwitchOptions({
    targetRouteName,
    pathname,
    search,
    defaultDataSourceName,
  }: {
    targetRouteName: string;
    pathname: string;
    search: string;
    defaultDataSourceName?: string;
  }) {
    const targetIsMultisegmentRoute = isMultisegmentModeRoute(targetRouteName);
    const leavingHealthcareViewer = isLeavingHealthcareViewer(pathname, search);

    return {
      stripQueryParams:
        leavingHealthcareViewer && !targetIsMultisegmentRoute ? ['gcp'] : undefined,
      dataSourceName:
        !targetIsMultisegmentRoute && defaultDataSourceName ? defaultDataSourceName : undefined,
    };
  },
  fetchStudyEnvelopeOptions({ pathname }: { pathname: string; search: string }) {
    return { preferLoadedMetadata: isHealthcareViewerPath(pathname) };
  },
};

export default modeSelectorCustomization;
