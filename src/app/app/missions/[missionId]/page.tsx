import { notFound } from 'next/navigation';
import { getMissionSnapshot } from '@/server/missions';
import { MissionControl } from '@/components/mission/mission-control';

export const dynamic = 'force-dynamic';

export default async function MissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;
  // Workspace scoping happens server-side. The client never chooses its own tenant.
  const snapshot = await getMissionSnapshot(missionId, 'ws_local');
  if (!snapshot) notFound();

  return <MissionControl initial={snapshot} />;
}
