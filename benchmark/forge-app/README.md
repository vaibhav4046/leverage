# forge-app — Leverage benchmark fixture

A small receipt-splitting library. **The tests are written. The implementation is not.**

That asymmetry is the whole design. The test files are outside every task's
`fileScope`, so a worker physically cannot make the suite pass by weakening an
assertion — the only way to go green is to write code that is actually correct.

## The graph

```
money.js      validate.js        <- independent, run in parallel
     \            /
      \          /
        split.js                 <- depends on both
           |
        index.js                 <- depends on split
```

## Running it

From this directory:

```bash
node --test
```

(`npm test` runs the same four files. `node --test test/` does not work on Node 24:
a directory argument is treated as a module path and fails with "Cannot find module".)

Four suites, 17 tests, 29 assertions. All fail on a clean checkout, which is the point:
a benchmark you can pass by doing nothing measures nothing.
