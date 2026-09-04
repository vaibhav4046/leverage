/**
 * The services the cloud execution path depends on.
 *
 * RocketRide runs workers in its own cloud, so it needs a publicly reachable
 * OpenAI-compatible router. Before this file that was three processes started by
 * hand in three shells, which meant the cloud path quietly stopped working
 * whenever a terminal closed. pm2 already resurrects on boot on this machine, so
 * putting them here is what turns "it worked when I ran it" into "it is running".
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save                          # survive a reboot
 *   pm2 logs leverage-pool-tunnel     # confirm the public endpoint registered
 *
 * Only the tunnel is managed here. Ollama and the router are machine-level
 * services that are already running; a second pm2-owned copy just loses a fight
 * for the port and restarts forever, which is what happened when I tried it.
 * The tunnel is the Leverage-specific piece and the one that was silently
 * failing, so it is the one worth supervising.
 */
module.exports = {
  apps: [
    {
      // Normalises the router's streaming default into the single-JSON contract
      // RocketRide's component can actually parse. The tunnel publishes this,
      // never the router directly.
      name: 'leverage-pool-proxy',
      script: 'scripts/pool-proxy.mjs',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 3000,
      watch: false,
    },
    {
      name: 'leverage-pool-tunnel',
      script: 'scripts/pool-tunnel.mjs',
      args: '--quiet',
      cwd: __dirname,
      autorestart: true,
      // A quick tunnel gets a new hostname on every restart, and the script
      // re-registers it. Backing off stops a flapping upstream from rewriting
      // .env.local dozens of times a minute.
      restart_delay: 5000,
      max_restarts: 20,
      min_uptime: 10000,
      watch: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
