import type { GcpRequest } from './gcpStores';
import type { StoreCheck } from './storeCheck';

export type StoreProblem = {
  title: string;
  message: string;
  /** What the user can do about it. */
  hint: string;
  type: 'error' | 'warning';
  /** Offer to sign in again instead of copying details. */
  signIn?: boolean;
};

const DICOM_VIEWER_ROLE = 'Healthcare DICOM Viewer (roles/healthcare.dicomViewer)';

const EXPECTED_STORE_PATH =
  'projects/<project>/locations/<location>/datasets/<dataset>/dicomStores/<store>';

/** Explains a failed or empty store check. Returns null when the store has the study. */
export function describeStoreCheck(check: StoreCheck, userEmail?: string): StoreProblem | null {
  const { store, studyInstanceUID, status, httpStatus } = check;
  const storeName = `"${store.dicomStore}"`;
  const account = userEmail ? `Your Google account (${userEmail})` : 'Your Google account';

  switch (status) {
    case 'ok':
      return null;
    case 'empty':
      return {
        type: 'warning',
        title: 'Study not in GCP DICOM store',
        message: `Study ${studyInstanceUID} was not found in DICOM store ${storeName}.`,
        hint: 'Check that the study UID and the DICOM store in the link belong together.',
      };
    case 'unauthenticated':
      return {
        type: 'error',
        signIn: true,
        title: 'Google sign-in required',
        message: `Your Google sign-in is missing or has expired, so DICOM store ${storeName} could not be read.`,
        hint: 'Sign in again with a Google account that has access to the store.',
      };
    case 'forbidden':
      return {
        type: 'error',
        title: 'No access to GCP DICOM store',
        message: `${account} does not have permission to read DICOM store ${storeName} in project "${store.project}", or the store does not exist.`,
        hint: `Ask the store owner to grant your account the ${DICOM_VIEWER_ROLE} role, or check the project, location, dataset and store names in the link.`,
      };
    case 'notFound':
      return {
        type: 'error',
        title: 'GCP DICOM store not found',
        message: `DICOM store ${storeName} was not found in dataset "${store.dataset}" (project "${store.project}", location "${store.location}").`,
        hint: 'Check the project, location, dataset and store names in the link.',
      };
    case 'network':
      return {
        type: 'error',
        title: 'Could not reach Google Cloud',
        message: `The viewer could not reach the Google Cloud Healthcare API to read DICOM store ${storeName}.`,
        hint: 'Check your network connection, VPN or firewall, then reload the page.',
      };
    case 'unavailable':
      return {
        type: 'error',
        title: 'GCP DICOM store unavailable',
        message: `The Google Cloud Healthcare API answered HTTP ${httpStatus} for DICOM store ${storeName}.`,
        hint:
          httpStatus === 429
            ? 'The project has hit its request quota. Try again in a few minutes.'
            : 'The service is having trouble. Try again in a few minutes.',
      };
    default:
      return {
        type: 'error',
        title: 'Could not read GCP DICOM store',
        message: `The Google Cloud Healthcare API answered HTTP ${httpStatus} for DICOM store ${storeName}.`,
        hint: 'Copy the details and send them to the person who shared the link.',
      };
  }
}

/** Explains a `?gcp=` value that is not a DICOM store path. */
export function describeInvalidGcpParam(value: string): StoreProblem {
  return {
    type: 'error',
    title: 'Invalid GCP link',
    message: `The gcp parameter "${value}" is not a DICOM store path, so no data was loaded from Google Cloud.`,
    hint: `The parameter should look like ${EXPECTED_STORE_PATH}.`,
  };
}

/**
 * Plain-text report a user can paste into a support request. It never
 * includes tokens.
 */
export function formatSupportDetails({
  request,
  checks,
  userEmail,
}: {
  request: GcpRequest;
  checks: StoreCheck[];
  userEmail?: string;
}): string {
  const lines = [
    'GCP DICOM store check',
    `Time: ${new Date().toISOString()}`,
    `Viewer link: ${request.url}`,
    `Signed in as: ${userEmail || 'not signed in'}`,
    `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
  ];

  if (request.invalidGcpParam) {
    lines.push('', `Invalid gcp parameter: ${request.invalidGcpParam}`);
  }

  checks.forEach(check => {
    lines.push(
      '',
      `Store: ${check.store.path}`,
      `Study: ${check.studyInstanceUID}`,
      `Result: ${check.status}${check.httpStatus ? ` (HTTP ${check.httpStatus})` : ''}`
    );
    if (check.gcpMessage) {
      lines.push(`Google Cloud message: ${check.gcpMessage}`);
    }
  });

  return lines.join('\n');
}
