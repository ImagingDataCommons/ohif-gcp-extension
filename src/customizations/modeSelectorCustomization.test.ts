import modeSelectorCustomization from './modeSelectorCustomization';

describe('ohif-gcp modeSelectorCustomization', () => {
  const healthcarePath =
    '/projects/p/locations/l/datasets/d/dicomStores/s/study/1.3.6.1.4.1.14519.5.2.1.123';
  const healthcarePathWithSeries =
    '/projects/p/locations/l/datasets/d/dicomStores/s/study/1.3.6.1.4.1.14519.5.2.1.123/series/1.3.6.1.4.1.14519.5.2.1.456';

  it('reads StudyInstanceUIDs from healthcare paths', () => {
    expect(
      modeSelectorCustomization.resolveStudyUidsForNavigation({
        pathname: healthcarePath,
        search: '',
      })
    ).toEqual(['1.3.6.1.4.1.14519.5.2.1.123']);
  });

  it('reads StudyInstanceUIDs from healthcare paths with series', () => {
    expect(
      modeSelectorCustomization.resolveStudyUidsForNavigation({
        pathname: healthcarePathWithSeries,
        search: '',
      })
    ).toEqual(['1.3.6.1.4.1.14519.5.2.1.123']);
  });

  it('reads SeriesInstanceUIDs from healthcare paths', () => {
    expect(
      modeSelectorCustomization.resolveSeriesUidsForNavigation({
        pathname: healthcarePathWithSeries,
        search: '',
      })
    ).toEqual(['1.3.6.1.4.1.14519.5.2.1.456']);
  });

  it('reads SeriesInstanceUIDs from initialSeriesInstanceUID query param', () => {
    expect(
      modeSelectorCustomization.resolveSeriesUidsForNavigation({
        pathname: healthcarePath,
        search: '?initialSeriesInstanceUID=1.3.6.1.4.1.14519.5.2.1.789',
      })
    ).toEqual(['1.3.6.1.4.1.14519.5.2.1.789']);
  });

  it('reads SeriesInstanceUIDs from SeriesInstanceUIDs query param', () => {
    expect(
      modeSelectorCustomization.resolveSeriesUidsForNavigation({
        pathname: healthcarePath,
        search: '?SeriesInstanceUIDs=1.3.6.1.4.1.14519.5.2.1.789',
      })
    ).toEqual(['1.3.6.1.4.1.14519.5.2.1.789']);
  });

  it('prioritizes query param over path for SeriesInstanceUIDs', () => {
    expect(
      modeSelectorCustomization.resolveSeriesUidsForNavigation({
        pathname: healthcarePathWithSeries,
        search: '?initialSeriesInstanceUID=1.3.6.1.4.1.14519.5.2.1.query',
      })
    ).toEqual(['1.3.6.1.4.1.14519.5.2.1.query']);
  });

  it('strips gcp and sets datasources when leaving healthcare viewer', () => {
    expect(
      modeSelectorCustomization.augmentBuildModeSwitchOptions({
        targetRouteName: 'segmentation',
        pathname: healthcarePath,
        search: '?gcp=foo',
        defaultDataSourceName: 'idc-dicomweb',
      })
    ).toEqual({
      stripQueryParams: ['gcp'],
      dataSourceName: 'idc-dicomweb',
    });
  });

  it('does not strip gcp when switching to another multisegment route', () => {
    expect(
      modeSelectorCustomization.augmentBuildModeSwitchOptions({
        targetRouteName: 'projects/:project/locations/:location/datasets/:dataset/dicomStores/:dicomStore/study/:StudyInstanceUIDs',
        pathname: healthcarePath,
        search: '?gcp=foo',
        defaultDataSourceName: 'idc-dicomweb',
      })
    ).toEqual({
      stripQueryParams: undefined,
      dataSourceName: undefined,
    });
  });

  it('prefers loaded metadata on healthcare paths', () => {
    expect(
      modeSelectorCustomization.fetchStudyEnvelopeOptions({
        pathname: healthcarePath,
        search: '',
      })
    ).toEqual({ preferLoadedMetadata: true });
  });
});
