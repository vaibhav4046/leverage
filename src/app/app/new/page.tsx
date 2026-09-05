import { getPageIdentity } from '@/auth/identity';
import { AuthNotice } from '@/components/app/auth-notice';
import { MissionComposer } from '@/components/app/mission-composer';

export const metadata = { title: 'New mission · Leverage' };

export const dynamic = 'force-dynamic';

/**
 * Server wrapper for the composer.
 *
 * The read-only state is resolved here rather than discovered by pressing the
 * button and reading a 403. Telling someone why a control will refuse, before they
 * use it, is the difference between a demo and a broken page.
 */
export default function NewMissionPage() {
  const identity = getPageIdentity();
  if (!identity) return <AuthNotice />;
  return <MissionComposer readOnly={identity.readOnly} />;
}
