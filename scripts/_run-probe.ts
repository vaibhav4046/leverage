import { dispatch } from '../mcp/tools';

/** Start a mission on a repository through the MCP tool code and print its id. */
async function main(): Promise<void> {
  const [repositoryRoot, goal] = process.argv.slice(2);
  if (!repositoryRoot || !goal) throw new Error('usage: _run-probe.ts <repositoryRoot> <goal>');
  const out = (await dispatch('leverage_run', { repositoryRoot, goal, budgetMaxUsd: 0, qualityTarget: 0.95 })) as Record<string, unknown>;
  console.log(JSON.stringify(out));
}
void main();
