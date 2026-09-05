# greeter

A third fixture, and the only one with no committed plan. `test/` describes three
small modules that do not exist on a clean checkout; the task graph that builds
them is written by a planner model from the goal and this directory, then
validated by the compiler before a worker is hired.

```bash
npm run fixture:reset:greeter
npm run mission -- --repo=benchmark/greeter --goal="Implement src/ so the whole test suite in test/ passes. Do not modify any file under test/. Budget: $0."
```

The tests are the specification. `src/` is gitignored so the fixture fails on a
clean checkout, exactly like the other two.
