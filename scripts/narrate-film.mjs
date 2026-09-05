/**
 * Voice the master film, and give the composition the timing to cut on.
 *
 * One call to ElevenLabs for the whole script, so prosody is continuous across
 * lines, with character-level timestamps back. Each line's first and last
 * character give its start and end, and the composition places a scene on each.
 * The narration lives here, in one place, so the film and the audio cannot drift.
 *
 *   node scripts/narrate-film.mjs            # writes motion/assets/film-voice.mp3 + film-timing.json
 *   VOICE_ID=... node scripts/narrate-film.mjs
 *
 * Needs ELEVENLABS_API_KEY in the environment or in .env.local. The key is read,
 * sent as a header, and never printed.
 */
import fs from 'node:fs';
import path from 'node:path';

const VOICE_ID = process.env.VOICE_ID ?? 'onwK4e9ZLuTAKqWW03F9'; // Daniel, steady broadcaster
const MODEL_ID = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
const OUT_DIR = path.resolve('motion/assets');
// Another script, another voice track: NARRATION_FILE is a JSON array of
// { id, text } lines and NARRATION_NAME names the outputs (default "film").
const NAME = process.env.NARRATION_NAME ?? 'film';
const SCRIPT_LINES = process.env.NARRATION_FILE
  ? JSON.parse(fs.readFileSync(process.env.NARRATION_FILE, 'utf8'))
  : null;

/** Every figure here is one a judge can open on the live site. */
export const LINES = [
  { id: 'thesis', text: 'Your strongest model should decide the architecture. It should not write the fortieth boilerplate test.' },
  { id: 'what', text: 'Leverage is an intelligence resource manager for MCP hosts. Your frontier model stays the strategist. Leverage hires the workforce underneath it.' },
  { id: 'policy', text: 'Hard policy runs before scoring. A paid model under a zero dollar budget is not ranked lower. It is removed. Then an auction hires the best eligible worker for every task.' },
  { id: 'rocketride', text: 'Cloud workers execute as RocketRide pipelines, through a permanent hosted pool. Credits are measured, not estimated.' },
  { id: 'handoff', text: 'When a worker hits a rate limit, Leverage checkpoints what it understood and hands it to a replacement. The work does not restart.' },
  { id: 'proof', text: 'A model saying done is not proof. A task completes when a compiler or a test suite agrees.' },
  { id: 'close', text: 'Four of four tasks verified. Three handoffs. Zero dollars of paid inference. One frontier brain. An elastic workforce.' },
];

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  const m = env.match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!m) throw new Error('ELEVENLABS_API_KEY is not set (environment or .env.local)');
  return m[1].trim();
}

async function main() {
  const script = SCRIPT_LINES ?? LINES;
  const text = script.map((l) => l.text).join('\n\n');
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = body.alignment;

  // Map each line back onto the alignment by walking the sent text.
  const sent = characters.join('');
  let cursor = 0;
  const lines = script.map((l) => {
    const at = sent.indexOf(l.text, cursor);
    if (at === -1) throw new Error(`alignment does not contain line "${l.id}"`);
    cursor = at + l.text.length;
    return { id: l.id, text: l.text, start: starts[at], end: ends[cursor - 1] };
  });
  const duration = ends[ends.length - 1];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${NAME}-voice.mp3`), Buffer.from(body.audio_base64, 'base64'));
  fs.writeFileSync(
    path.join(OUT_DIR, `${NAME}-timing.json`),
    JSON.stringify({ voiceId: VOICE_ID, modelId: MODEL_ID, duration, lines }, null, 2) + '\n',
  );

  console.log(`voice ${VOICE_ID}  model ${MODEL_ID}  duration ${duration.toFixed(2)}s  ${text.length} chars`);
  for (const l of lines) console.log(`  ${l.start.toFixed(2).padStart(6)} -> ${l.end.toFixed(2).padStart(6)}  ${l.id}`);
}

main().catch((err) => {
  console.error(`narrate-film failed: ${err.message}`);
  process.exit(1);
});
