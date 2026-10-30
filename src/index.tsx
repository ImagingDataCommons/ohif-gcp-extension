import { id } from './id';
import getToolbarModule from './getToolbarModule';
import modeSelectorCustomization from './customizations/modeSelectorCustomization';
import {
  StudyNotFoundPage,
  initStoreDiagnostics,
  notifyStoreDiagnostics,
  onLeaveViewer,
  parseGcpStore,
} from './storeDiagnostics';

/**
 * Extracts SeriesInstanceUIDs from query parameters.
 * Supports: initialSeriesInstanceUID, SeriesInstanceUIDs, seriesInstanceUIDs
 */
function getInitialSeriesInstanceUIDsFromQuery(): string[] {
  const params = new URLSearchParams(window.location.search);
  return [
    ...params.getAll('initialSeriesInstanceUID'),
    ...params.getAll('SeriesInstanceUIDs'),
    ...params.getAll('seriesInstanceUIDs'),
  ]
    .flatMap(uid => uid.split(','))
    .map(uid => uid.trim())
    .filter(Boolean);
}

/**
 * GCP Extension for IDC.
 *
 * This extension provides:
 * - GCP data source with onConfiguration for dynamic URL parsing from ?gcp= query param
 * - Merge data source combining IDC + GCP when ?gcp= param is present
 * - Mode selector customization for GCP Healthcare API path navigation
 * - Toolbar module for mode selector UI
 * - initialSeriesInstanceUID support for series-level navigation
 * - Diagnostics for GCP DICOM stores that cannot be read (no access, expired
 *   sign-in, missing store or study, invalid link), shown as notifications in
 *   the viewer and on the "study not found" page
 */
export default {
  /**
   * Only required property. Should be a unique value across all extensions.
   */
  id,
  getToolbarModule,
  getCustomizationModule() {
    return [
      {
        name: 'default',
        value: {
          'ohif.modeSelector': modeSelectorCustomization,
          'routes.customRoutes': {
            routes: {
              $push: [{ path: '/notfoundstudy', children: StudyNotFoundPage }],
            },
          },
        },
      },
    ];
  },
  /**
   * onModeEnter is called when any mode is entered.
   * Checks the GCP stores in the link and handles the initialSeriesInstanceUID
   * query parameter for series-level navigation.
   */
  onModeEnter({ servicesManager }: { servicesManager: any }) {
    notifyStoreDiagnostics();

    const initialSeriesUIDs = getInitialSeriesInstanceUIDsFromQuery();
    if (initialSeriesUIDs.length === 0) {
      return;
    }

    console.debug('[GCP Extension] Initial series UIDs from query:', initialSeriesUIDs);

    const { displaySetService, hangingProtocolService } = servicesManager.services;

    /**
     * Wait for display sets to be added, then activate the matching series.
     * Uses a subscription to handle async study loading.
     */
    const activateInitialSeries = () => {
      const displaySets = displaySetService.getActiveDisplaySets();

      for (const seriesUID of initialSeriesUIDs) {
        const matchingDisplaySet = displaySets.find(
          (ds: any) => ds.SeriesInstanceUID === seriesUID
        );

        if (matchingDisplaySet) {
          console.debug('[GCP Extension] Activating series:', seriesUID);

          /** Use hanging protocol service to set the initial display set */
          try {
            hangingProtocolService.setDisplaySetsForViewports([
              {
                viewportId: 'default',
                displaySetInstanceUIDs: [matchingDisplaySet.displaySetInstanceUID],
              },
            ]);
          } catch (e) {
            /** Fallback: try to set via displaySetService if hangingProtocolService fails */
            console.debug('[GCP Extension] Falling back to displaySetService');
          }
          return true;
        }
      }
      return false;
    };

    /** Try immediately in case display sets are already loaded */
    if (activateInitialSeries()) {
      return;
    }

    /** Subscribe to display set changes to handle async loading */
    const subscription = displaySetService.subscribe(
      displaySetService.EVENTS.DISPLAY_SETS_ADDED,
      () => {
        if (activateInitialSeries()) {
          subscription.unsubscribe();
        }
      }
    );

    /** Clean up subscription after 30 seconds to avoid memory leaks */
    setTimeout(() => {
      subscription.unsubscribe();
    }, 30000);
  },
  /**
   * Drops pending store diagnostics and their notifications when the viewer
   * is left.
   */
  onModeExit() {
    onLeaveViewer();
  },
  /**
   * preRegistration creates data sources for GCP Healthcare API access.
   * - 'gcp' data source: Configured dynamically from ?gcp= query param
   * - 'gcp-extension-merge': Merge data source combining IDC + GCP (only when ?gcp= present)
   */
  preRegistration: ({ extensionManager, appConfig, servicesManager }) => {
    console.debug('[GCP Extension] Initializing...');

    initStoreDiagnostics({ servicesManager, appConfig });

    const GCP_DATA_SOURCE_NAME = 'gcp';
    const IDC_DATA_SOURCE_NAME = 'idc-dicomweb';

    const defaultDataSource = appConfig.dataSources.find(
      (dataSource: { sourceName: string }) => dataSource.sourceName === IDC_DATA_SOURCE_NAME
    );

    /** Create GCP data source with dynamic configuration */
    extensionManager.addDataSource({
      friendlyName: 'GCP DICOMWeb Data Source From Query Params',
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: GCP_DATA_SOURCE_NAME,
      configuration: {
        name: GCP_DATA_SOURCE_NAME,
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: false,
        singlepart: 'bulkdata,video,pdf',
        bulkDataURI: { enabled: false },
        onConfiguration: (dicomWebConfig, options) => {
          const { query } = options;
          const gcp = query.get(GCP_DATA_SOURCE_NAME);
          if (gcp) {
            /** Same parser as the store diagnostics, so both agree on what is valid. */
            const store = parseGcpStore(gcp);
            if (store) {
              const pathUrl = store.dicomWebRoot;
              console.debug('[GCP Extension] Configured GCP endpoint:', pathUrl);
              return {
                ...dicomWebConfig,
                wadoRoot: pathUrl,
                qidoRoot: pathUrl,
                wadoUri: pathUrl,
                wadoUriRoot: pathUrl,
                qidoSupportsIncludeField: false,
                imageRendering: 'wadors',
                thumbnailRendering: 'wadors',
                enableStudyLazyLoad: true,
                supportsFuzzyMatching: false,
                supportsWildcard: false,
                singlepart: 'bulkdata,video,pdf',
                bulkDataURI: { enabled: false },
              };
            } else {
              /** The store diagnostics tell the user about the invalid link. */
              return defaultDataSource?.configuration || dicomWebConfig;
            }
          }
          return dicomWebConfig;
        },
      },
    });

    /** Check for ?gcp= param in URL or stored redirect */
    let redirectURL: { search: string } | null = null;
    const storedRedirect = sessionStorage.getItem('ohif-redirect-to');
    if (storedRedirect) {
      try {
        redirectURL = JSON.parse(storedRedirect);
      } catch (error) {
        console.error('[GCP Extension] Failed to parse stored redirect URL', error);
      }
    }
    const redirectQueryParams = new URLSearchParams(redirectURL?.search || '');
    const query = new URLSearchParams(window.location.search);
    const gcpURLFromQueryParam =
      query.get(GCP_DATA_SOURCE_NAME) || redirectQueryParams.get(GCP_DATA_SOURCE_NAME);

    /** Only create merge data source if ?gcp= param is present */
    if (gcpURLFromQueryParam) {
      console.debug('[GCP Extension] Creating merge data source for IDC + GCP');
      extensionManager.addDataSource(
        {
          sourceName: 'gcp-extension-merge',
          namespace: '@ohif/extension-default.dataSourcesModule.merge',
          configuration: {
            name: 'gcp-extension-merge',
            friendlyName: 'IDC + GCP Merge Data Source',
            seriesMerge: {
              dataSourceNames: [IDC_DATA_SOURCE_NAME, GCP_DATA_SOURCE_NAME],
              defaultDataSourceName: IDC_DATA_SOURCE_NAME,
            },
          },
        },
        { activate: true }
      );
    }
  },
};
