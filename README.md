# GCP Extension for OHIF Viewer

## Overview

The **GCP Extension** is an OHIF Viewer extension that enables seamless integration with [Google Cloud Healthcare API](https://cloud.google.com/healthcare-api/docs/concepts/dicom). It allows loading and merging DICOM imaging studies directly from GCP Healthcare DICOM stores via query parameters, making it easy to combine data from multiple sources within the OHIF Viewer.

This extension is developed and maintained by the [NCI Imaging Data Commons (IDC)](https://imaging.datacommons.cancer.gov/) team.

## Key Features

### Data Source Integration
- **Dynamic GCP Data Source**: Automatically configures DICOMweb endpoints from GCP Healthcare API URLs provided via query parameters
- **Study Merging**: Combines series from multiple data sources (default + GCP) into a unified view
- **URL Validation**: Validates GCP Healthcare API URLs before attempting to load studies

### Customization
- **Mode Selector**: Provides customization for the OHIF mode selector UI
- **Toolbar Module**: Includes toolbar customization capabilities

### URL Support
Supports both absolute and relative GCP Healthcare API paths:
- Absolute: `https://healthcare.googleapis.com/v1/projects/.../dicomStores/.../study/...`
- Relative: `/projects/.../dicomStores/.../study/...`

## Installation

### Prerequisites
- OHIF Viewer v3.x
- Node.js >= 14
- Yarn >= 1.18.0 or npm >= 6

### 1. Add as a Dependency

In your OHIF fork's `platform/app/package.json`, include `@idc/gcp-extension` as a dependency. This package is scoped under `@idc` and is not published to the public NPM registry. Pin it to a specific Git commit hash (not a branch name) to ensure reproducible builds and prevent dependency confusion.

```json
{
  "dependencies": {
    "@idc/gcp-extension": "https://github.com/ImagingDataCommons/ohif-gcp-extension#<commit-sha>"
  }
}
```

### 2. Register the Extension

Update `platform/app/pluginConfig.json` to load the extension:

```json
{
  "extensions": [
    {
      "packageName": "@idc/gcp-extension"
    }
  ]
}
```

## Usage

Load studies by adding the `gcp` query parameter to your OHIF Viewer URL:

```
http://localhost:3000/viewer?StudyInstanceUIDs=<study-uid>&gcp=<gcp-healthcare-url>
```

### Examples

**Full GCP Healthcare API URL:**
```
http://localhost:3000/viewer?StudyInstanceUIDs=2.25.169909530366026741902094648458907485460&gcp=https://healthcare.googleapis.com/v1/projects/my-project/locations/us-central1/datasets/my-dataset/dicomStores/my-store/study/2.25.169909530366026741902094648458907485460
```

**Relative GCP Path:**
```
http://localhost:3000/viewer?StudyInstanceUIDs=2.25.169909530366026741902094648458907485460&gcp=/projects/my-project/locations/us-central1/datasets/my-dataset/dicomStores/my-store/study/2.25.169909530366026741902094648458907485460
```

## Configuration

The extension automatically configures the DICOMweb data source with the following settings optimized for GCP Healthcare API:

| Setting | Value |
|---------|-------|
| `imageRendering` | `wadors` |
| `thumbnailRendering` | `wadors` |
| `enableStudyLazyLoad` | `true` |
| `supportsFuzzyMatching` | `false` |
| `supportsWildcard` | `false` |
| `singlepart` | `bulkdata,video,pdf` |

## Development

```bash
git clone https://github.com/ImagingDataCommons/ohif-gcp-extension.git
cd ohif-gcp-extension
yarn install
yarn dev
```

### Build for Production

```bash
yarn build
```

## Related Projects

- [OHIF Viewer](https://github.com/OHIF/Viewers) - Open Health Imaging Foundation Viewer
- [GCP Mode](https://github.com/ImagingDataCommons/ohif-gcp-mode) - OHIF mode for direct GCP Healthcare API URL routing
- [Imaging Data Commons](https://imaging.datacommons.cancer.gov/) - NCI cloud-based repository of cancer imaging data

## License

MIT License - see [LICENSE](LICENSE) for details.
