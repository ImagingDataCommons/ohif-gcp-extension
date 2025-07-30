import { useEffect } from 'react';
import { useSystem } from '@ohif/core';
import { useNavigate } from 'react-router-dom';

import routeName from './routeName';

const GCPRedirect = () => {
  const { extensionManager } = useSystem();
  const navigate = useNavigate();

  useEffect(() => {
    const QUERY_PARAM_KEY = "gcp";
    const gcpDataSourceName = "gcp-mode-dicomweb-data-source";
    let dataSourceName = gcpDataSourceName;

    extensionManager.addDataSource({
      friendlyName: "GCP DICOMWeb Data Source",
      namespace: "@ohif/extension-default.dataSourcesModule.dicomweb",
      sourceName: gcpDataSourceName,
      configuration: {
        name: gcpDataSourceName,
        qidoSupportsIncludeField: false,
        imageRendering: "wadors",
        thumbnailRendering: "wadors",
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: false,
        singlepart: "bulkdata,video,pdf",
        useBulkDataURI: false,
        onConfiguration: (dicomWebConfig, options) => {
          const { params } = options;
          const { project, location, dataset, dicomStore } = params;
          const pathUrl = `https://healthcare.googleapis.com/v1/projects/${project}/locations/${location}/datasets/${dataset}/dicomStores/${dicomStore}/dicomWeb`;
          return {
            ...dicomWebConfig,
            wadoRoot: pathUrl,
            qidoRoot: pathUrl,
            wadoUri: pathUrl,
            wadoUriRoot: pathUrl,
          };
        },
      },
    });

    const query = new URLSearchParams(window.location.search);
    const gcpURLFromQueryParam = query.get(QUERY_PARAM_KEY);
    if (gcpURLFromQueryParam) {
      dataSourceName = "gcp-mode-merge";
      console.debug("Activating merge data source using gcp query param...");
      extensionManager.addDataSource(
        {
          sourceName: "gcp-mode-merge",
          namespace: "@ohif/extension-default.dataSourcesModule.merge",
          configuration: {
            name: "gcp-mode-merge",
            friendlyName: "GCP Merge Data Source",
            seriesMerge: {
              dataSourceNames: [gcpDataSourceName, QUERY_PARAM_KEY],
              defaultDataSourceName: gcpDataSourceName,
            },
          },
        },
        { activate: true }
      );
    } else {
      extensionManager.setActiveDataSource(gcpDataSourceName);
    }

    const path = window.location.pathname;
    const studyInstanceUIDs = path.split('study/')[1];
    if (studyInstanceUIDs) {
      navigate(`/viewer?StudyInstanceUIDs=${studyInstanceUIDs}&dataSource=${dataSourceName}`);
    }
  }, []);

  return null;
};

export default function getCustomizationModule({ servicesManager, extensionManager }) {
  console.debug("Loading GCP extension customization module...");
  return [
    {
      name: 'default',
      value: {
        'routes.customRoutes': {
          routes: {
            $push: [
              {
                path: routeName,
                children: GCPRedirect,
              },
            ],
          },
        },
      },
    },
  ];
}