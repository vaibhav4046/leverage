import { notFound } from 'next/navigation';
import { getMissionSnapshot } from '@/server/missions';
import { getPageIdentity } from '@/auth/identity';
import { AuthNotice } from '@/components/app/auth-notice';
import { MissionControl } from '@/components/mission/mission-control';

export const dynamic = 'force-dynamic';

export default async function MissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;
  const identity = getPageIdentity();
  if (!identity) return <AuthNotice />;
  // Workspace scoping happens server-side. The client never chooses its own tenant.
  const snapshot = await getMissionSnapshot(missionId, identity.workspaceId);
  if (!snapshot) notFound();

  return <MissionControl initial={snapshot} readOnly={identity.readOnly} />;
}
