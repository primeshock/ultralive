# Koosha Live controlled load testing

This isolated runner measures real student-side LiveKit fan-out. It does not alter the production app, LiveKit ingress, codecs, Nginx, authentication, or MongoDB schemas.

## Install and inspect

```sh
cd load-test
npm install
npm run profiles
npm run loadtest -- --help
```

The runner uses the real flow: owner/admin login, admin-created test link, room-session cookies, `/api/livekit/token`, and `@livekit/rtc-node` with `autoSubscribe: true`.

## Run one profile

The default target is local `http://127.0.0.1:5000`. A channel must already exist and LiveKit must already be publishing teacher media.

```sh
npm run loadtest -- --profile smoke --base-url http://127.0.0.1:5000 \
  --channel algebra --username owner --password 'REDACTED'
npm run loadtest -- --profile 10 --channel algebra --username owner --password 'REDACTED'
```

For a non-local production target, both flags are mandatory:

```sh
npm run loadtest -- --profile 100 --target-production \
  --base-url https://example.invalid --channel algebra --username owner --password 'REDACTED'
```

Profiles above 100 users additionally require `--allow-large`. The runner never runs multiple profiles and never automatically advances to the next level.

Results are written to `load-test/results/<test-id>.json`; the directory is intentionally outside production analytics and should not be served publicly.

## Safety defaults

Defaults are visible in `runner.js` and can be overridden explicitly:

- CPU: 85 percent
- RAM: 85 percent
- error rate: 10 percent
- reconnect rate: 10 percent
- local event-loop mean lag: 250 ms
- three consecutive monitoring breaches to abort
- 2 new users per second ramp-up

The runner polls the Owner telemetry endpoint every five seconds, records real Phase 4 snapshots, and also records local VPS load average, process count, and PM2 resource samples. A breach prevents further users from being added and disconnects all connected clients cleanly. These are conservative operational defaults, not a capacity claim; adjust them only with an explicit test decision.

The output reports connection/token latency, p95 latency, failures, reconnects, subscriptions, network rates, rooms, participants, publishers, MongoDB/Redis/LiveKit status, and abort reason. A test is not called passed by the tool: `aborted` and the factual measurements determine interpretation.

No smoke or production test is run automatically by repository validation. Supply valid credentials and a real active class before running one.
