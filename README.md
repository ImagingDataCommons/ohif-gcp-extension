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

### Series-Level Navigation
Supports deep-linking to specific series from external DICOM stores. Works with both standard OHIF modes (`/viewer`) and GCP mode (`/projects/...`).

**Query parameters supported:**
- `initialSeriesInstanceUID=<series-uid>`
- `SeriesInstanceUIDs=<series-uid>`

The extension automatically activates the specified series in the viewport when the study loads.

### Store Diagnostics
When a link names a GCP DICOM store (`?gcp=` in any mode, or the GCP mode route), the extension asks
that store for the requested study and tells the user what went wrong, if anything:

| Result | What the user sees |
|---|---|
| HTTP 401 | Sign-in missing or expired, with a **Sign in again** button |
| HTTP 403 | The signed-in account cannot read the store (or the store does not exist), with the IAM role to request |
| HTTP 404 | The project, dataset or store does not exist |
| No response | The Google Cloud Healthcare API could not be reached (network, VPN, firewall or CORS) |
| HTTP 429 / 5xx | Quota or service trouble, try again later |
| Empty | The store does not hold the study |
| Invalid `?gcp=` | The value is not a DICOM store path, with the expected shape |

In the viewer these are notifications; errors stay until their button is used. They are hidden when
the viewer is left. When OHIF ends up on its "study not found" page, the extension replaces that page
with the same explanation, the reason Google Cloud gave, and buttons to sign in again, copy support
details or reopen the link. The page keeps working after a reload, and "Sign in again" returns to
the original link. **Copy details** produces a plain-text report (link, signed-in email, store,
study, HTTP status, Google Cloud message) that users can send to whoever shared the link; tokens in
the link are removed. Each check is also logged to the console with a `[GCP]` prefix.

"Sign in again" is only offered when the viewer has Google sign-in (`oidc` in the app config).
Without it, a store that needs sign-in is reported as such.

The `?gcp=` value is parsed once (`parseGcpStore`) for both the data source and the diagnostics.

Turn it off with `gcpStoreDiagnostics: { enabled: false }` in the app config.

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

**With Series Instance UID (standard OHIF viewer + GCP extension):**
```
http://localhost:3000/viewer?StudyInstanceUIDs=2.25.169909530366026741902094648458907485460&gcp=/projects/my-project/locations/us-central1/datasets/my-dataset/dicomStores/my-store&initialSeriesInstanceUID=1.3.6.1.4.1.14519.5.2.1.123456789
```

**With Series Instance UID (GCP mode):**
```
http://localhost:3000/projects/my-project/locations/us-central1/datasets/my-dataset/dicomStores/my-store/study/2.25.169909530366026741902094648458907485460?initialSeriesInstanceUID=1.3.6.1.4.1.14519.5.2.1.123456789
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
