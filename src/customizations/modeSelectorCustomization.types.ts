import type { BuildModeSwitchSearchOptions } from '../utils/modeSelectorUtils';

export type ModeSelectorStudyUidsContext = {
  studyInstanceUIDsFromViewer?: string[];
  pathname: string;
  search: string;
};

export type ModeSelectorSeriesUidsContext = {
  pathname: string;
  search: string;
};

export type ModeSelectorSwitchOptionsContext = {
  targetRouteName: string;
  pathname: string;
  search: string;
  defaultDataSourceName?: string;
};

export type ModeSelectorFetchEnvelopeContext = {
  pathname: string;
  search: string;
};

/** Optional hooks for deployments that use non-standard mode URLs (e.g. GCP Healthcare paths). */
export type ModeSelectorCustomization = {
  resolveStudyUidsForNavigation?: (
    context: ModeSelectorStudyUidsContext
  ) => string[] | undefined;
  /**
   * Resolves SeriesInstanceUIDs for series-level navigation.
   * Supports initialSeriesInstanceUID query param and GCP Healthcare API series paths.
   */
  resolveSeriesUidsForNavigation?: (
    context: ModeSelectorSeriesUidsContext
  ) => string[] | undefined;
  augmentBuildModeSwitchOptions?: (
    context: ModeSelectorSwitchOptionsContext
  ) => BuildModeSwitchSearchOptions;
  fetchStudyEnvelopeOptions?: (
    context: ModeSelectorFetchEnvelopeContext
  ) => { preferLoadedMetadata?: boolean };
};

export const defaultModeSelectorCustomization: ModeSelectorCustomization = {};
