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

```bash
node --test test/
```

Four suites, 21 assertions. All fail on a clean checkout, which is the point:
a benchmark you can pass by doing nothing measures nothing.
