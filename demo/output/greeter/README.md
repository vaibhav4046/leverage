# What the workers wrote for LVR-31eacf88

The three files under `src/` are exactly what the hired models produced in the
recorded mission `demo/planned-run.json` (the greeter fixture, plan written by a
model). Each proof in that file carries a `patchHash`: the first sixteen hex
characters of the SHA-256 of the JSON-encoded `[{path, content}]` the worker
returned. Recomputing it over these files reproduces every hash, so the code here
is the code that passed the tests, not a later edit.

To run the fixture's tests against it:

```bash
cp demo/output/greeter/src/*.js benchmark/greeter/src/
cd benchmark/greeter && npm test
```
