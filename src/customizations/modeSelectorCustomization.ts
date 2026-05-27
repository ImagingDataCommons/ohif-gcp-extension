import type { ModeSelectorCustomization } from './modeSelectorCustomization.types';

const GCP_HEALTHCARE_PATH =
  /\/projects\/[^/]+\/locations\/[^/]+\/datasets\/[^/]+\/dicomStores\/[^/]+\/study\//i;

function isHealthcareViewerPath(pathname: string): boolean {
  return GCP_HEALTHCARE_PATH.test(pathname);
}

function isMultisegmentModeRoute(routeName?: string): boolean {
  return Boolean(routeName?.includes('/'));
}

function extractStudyInstanceUIDsFromPath(pathname: string): string[] {
  const match = pathname.match(/\/study\/([^/]+)\/?$/i);
  if (!match?.[1]) {
    return [];
  }

  return decodeURIComponent(match[1])
    .split(',')
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
