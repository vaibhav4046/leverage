import { Page, PageHead } from '@/components/app/shell';
import { LiveRun } from '@/components/live/live-run';

export const metadata = { title: 'Live run · Leverage' };

export const dynamic = 'force-dynamic';

/** The one place on the public site where something actually runs. */
export default function LivePage() {
  return (
    <Page>
      <PageHead
        eyebrow="Live"
        title="Run a mission"
        lede="Everything else on this deployment is a recording of something that happened. This page is not. A real mission, real workers on RocketRide through the hosted pool, real verification, while you watch."
      />
      <LiveRun enabled={process.env.LEVERAGE_LIVE_RUN === '1'} />
    </Page>
  );
}
