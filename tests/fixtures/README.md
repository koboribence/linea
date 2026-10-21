# Test fixtures

Public sample files used by the parser tests.

| File | Source | License |
|---|---|---|
| `garmin-fenix-5-run.fit`, `garmin-edge-820-bike.fit`, `Edge810-Vector-2013-08-16-15-35-10.fit`, `sample-activity-indoor-trainer.fit`, `activity-unexpected-eof.fit` | [dtcooper/python-fitparse](https://github.com/dtcooper/python-fitparse/tree/master/tests/files) | MIT |
| `test.tcx`, `no_hr.tcx` | [vkurup/python-tcxparser](https://github.com/vkurup/python-tcxparser/tree/master/tests/files) | BSD-2-Clause |
| `cerknicko-jezero.gpx`, `cerknicko-without-times.gpx` | [tkrajina/gpxpy](https://github.com/tkrajina/gpxpy/tree/dev/test_files) | Apache-2.0 |
| `strava-ride-power.gpx` | Generated from `Edge810-Vector-…fit` with `scripts/make-strava-gpx.mjs` (Strava GPX layout) | MIT (derived) |

Notable quirks the tests rely on:

- `cerknicko-jezero.gpx` has one GPS spike (184 m in 2 s).
- `cerknicko-without-times.gpx` has timestamps on only its last 5 points.
- `sample-activity-indoor-trainer.fit` has no GPS and reports 0 m distance.
- `activity-unexpected-eof.fit` is truncated.
