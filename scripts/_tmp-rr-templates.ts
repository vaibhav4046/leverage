import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { RocketRideClient } from 'rocketride';

async function main() {
  const uri = process.env.ROCKETRIDE_URI ?? 'https://staging.rocketride.ai';
  const key = process.env.ROCKETRIDE_APIKEY!;
  const rr = new RocketRideClient({ auth: key, uri });
  await rr.connect();

  const templates = await rr.getAllTemplates().catch((e: Error) => ({ error: e.message }));
  const json = JSON.stringify(templates);
  console.log('templates raw length:', json.length);

  // Look for anything that is an LLM component we would not have to feed a
  // base_url to: that is what would remove the tunnel from the critical path.
  const llm = json.match(/"[a-z0-9_]*llm[a-z0-9_]*"/gi) ?? [];
  console.log('llm-ish keys:', [...new Set(llm)].slice(0, 40).join(' '));

  const providers = json.match(/"provider"\s*:\s*"([^"]+)"/g) ?? [];
  console.log('providers seen:', [...new Set(providers)].slice(0, 40).join(' '));

  console.log('head:', json.slice(0, 700));
  process.exit(0);
}

main().catch((e) => {
  console.error('failed:', (e as Error).message);
  process.exit(1);
});
