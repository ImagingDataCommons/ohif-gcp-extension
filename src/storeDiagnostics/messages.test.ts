import { getGcpRequest, parseGcpStore } from './gcpStores';
import { describeInvalidGcpParam, describeStoreCheck, formatSupportDetails } from './messages';
import type { StoreCheck, StoreCheckStatus } from './storeCheck';

const store = parseGcpStore('projects/p/locations/us/datasets/d/dicomStores/s');

const check = (status: StoreCheckStatus, extra: Partial<StoreCheck> = {}): StoreCheck => ({
  store,
  studyInstanceUID: '1.2.3',
  status,
  checkedAt: '2026-10-30T00:00:00.000Z',
  ...extra,
});

describe('describeStoreCheck', () => {
  it('says nothing when the store has the study', () => {
    expect(describeStoreCheck(check('ok'))).toBeNull();
  });

  it('names the account, store and role when access is denied', () => {
    const problem = describeStoreCheck(check('forbidden', { httpStatus: 403 }), {
      userEmail: 'a@b.org',
    });
    expect(problem.type).toBe('error');
    expect(problem.message).toContain('a@b.org');
    expect(problem.message).toContain('"s"');
    expect(problem.message).toContain('"p"');
    expect(problem.hint).toContain('roles/healthcare.dicomViewer');
  });

  it('offers to sign in again for an expired sign-in', () => {
    expect(describeStoreCheck(check('unauthenticated', { httpStatus: 401 })).signIn).toBe(true);
    expect(describeStoreCheck(check('forbidden'), { userEmail: 'a@b.org' }).signIn).toBeUndefined();
  });

  it('does not offer sign-in when the viewer has none', () => {
    const unauthenticated = describeStoreCheck(check('unauthenticated'), { canSignIn: false });
    expect(unauthenticated.signIn).toBeUndefined();
    expect(unauthenticated.message).toContain('does not offer');

    const forbidden = describeStoreCheck(check('forbidden'), { canSignIn: false });
    expect(forbidden.signIn).toBe(false);
    expect(forbidden.hint).toContain('readable without sign-in');
  });

  it('says when nobody is signed in on a 403', () => {
    const problem = describeStoreCheck(check('forbidden'));
    expect(problem.message).toContain('No Google account is signed in');
    expect(problem.signIn).toBe(true);
  });

  it('points at the study UID for a 400', () => {
    expect(describeStoreCheck(check('failed', { httpStatus: 400 })).hint).toContain('1.2.3');
  });

  it('warns rather than errors when only the study is missing', () => {
    const problem = describeStoreCheck(check('empty'));
    expect(problem.type).toBe('warning');
    expect(problem.message).toContain('1.2.3');
  });

  it('mentions quota for 429', () => {
    expect(describeStoreCheck(check('unavailable', { httpStatus: 429 })).hint).toContain('quota');
  });

  it.each(['notFound', 'network', 'unavailable', 'failed'] as StoreCheckStatus[])(
    'explains %s',
    status => {
      const problem = describeStoreCheck(check(status, { httpStatus: 500 }));
      expect(problem.title).toBeTruthy();
      expect(problem.hint).toBeTruthy();
    }
  );
});

describe('describeInvalidGcpParam', () => {
  it('shows the value and the expected shape', () => {
    const problem = describeInvalidGcpParam('oops');
    expect(problem.message).toContain('"oops"');
    expect(problem.hint).toContain('dicomStores/<store>');
  });
});

describe('formatSupportDetails', () => {
  it('lists the link, account and each check with the Google Cloud message', () => {
    const request = getGcpRequest({ pathname: '/viewer', search: '?gcp=bad' });
    const details = formatSupportDetails({
      request,
      checks: [check('forbidden', { httpStatus: 403, gcpMessage: 'denied' })],
      userEmail: 'a@b.org',
    });

    expect(details).toContain('Viewer link: /viewer?gcp=bad');
    expect(details).toContain('Signed in as: a@b.org');
    expect(details).toContain('Invalid gcp parameter: bad');
    expect(details).toContain(`Store: ${store.path}`);
    expect(details).toContain('Result: forbidden (HTTP 403)');
    expect(details).toContain('Google Cloud message: denied');
  });
});
