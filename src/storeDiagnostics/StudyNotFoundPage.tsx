import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@ohif/ui-next';

import type { StoreCheck } from './storeCheck';
import {
  copySupportDetails,
  getLastRequest,
  getProblems,
  hideStoreToasts,
  runStoreChecks,
  shouldShowStudyList,
  signInAgain,
} from './storeDiagnostics';

/**
 * Replaces OHIF's "study not found" page. When the link named a GCP DICOM
 * store, it checks that store and says why nothing was loaded: no access,
 * expired sign-in, missing store, missing study or an invalid link. Without
 * a GCP store it shows OHIF's usual message.
 */
function StudyNotFoundPage() {
  const request = getLastRequest();
  const [checks, setChecks] = useState<StoreCheck[] | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    hideStoreToasts();
    runStoreChecks(request).then(setChecks);
  }, [request]);

  const studyListLink = shouldShowStudyList() && (
    <p className="mt-2" data-cy="return-to-study-list-message">
      Return to the{' '}
      <Link className="text-highlight" to="/">
        study list
      </Link>{' '}
      to select a different study to view.
    </p>
  );

  if (!request) {
    return (
      <div className="text-foreground absolute flex h-full w-full items-center justify-center">
        <div>
          <h4 data-cy="study-not-found-message">
            One or more of the requested studies are not available at this time.
          </h4>
          {studyListLink}
        </div>
      </div>
    );
  }

  const problems = checks ? getProblems(request, checks) : [];

  return (
    <div className="text-foreground absolute flex h-full w-full items-center justify-center">
      <div style={{ maxWidth: 720, padding: 16 }} role="status" aria-live="polite">
        <h4 data-cy="study-not-found-message">The requested study could not be loaded.</h4>

        {!checks && (
          <p className="text-muted-foreground mt-2">Checking the Google Cloud DICOM store…</p>
        )}

        {checks && !problems.length && (
          <p className="text-muted-foreground mt-2">
            The Google Cloud DICOM store answered and holds the study, so the problem is elsewhere.
            Copy the details below and send them to the person who shared the link.
          </p>
        )}

        {problems.map(({ key, problem, check }) => (
          <div key={key} className="mt-4" data-cy="gcp-store-problem">
            <p className="font-semibold">{problem.title}</p>
            <p className="mt-2">{problem.message}</p>
            <p className="text-muted-foreground mt-2">{problem.hint}</p>
            {check?.gcpMessage && (
              <p className="text-muted-foreground mt-2">Google Cloud said: {check.gcpMessage}</p>
            )}
          </div>
        ))}

        {checks && (
          <div className="mt-4 flex" style={{ gap: 8 }}>
            {problems.some(({ problem }) => problem.signIn) && (
              <Button onClick={() => signInAgain(request)}>Sign in again</Button>
            )}
            <Button variant="secondary" onClick={() => copySupportDetails(request, checks)}>
              Copy details
            </Button>
            <Button variant="ghost" onClick={() => window.location.assign(request.url)}>
              Open the link again
            </Button>
          </div>
        )}

        {studyListLink}
      </div>
    </div>
  );
}

export default StudyNotFoundPage;
