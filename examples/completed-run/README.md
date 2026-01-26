# completed-run (pre-baked)

This folder is here so a judge can *inspect outputs immediately* without waiting on a full Copilot swarm run.

What’s included (verifiable artifacts):

- `plans/` — example execution plans.
- `runs/` — a real, completed `demo-fast` run (including `/share` transcripts under `runs/.../steps/*/share.md`).

Why this matters:

- The orchestrator normally writes `plans/` + `runs/` into *the repo you run it from* (see the “Swarm execution artifacts” section in the main README).
- For this repo, we keep those runtime artifacts out of the root and instead commit one sanitized example here.

Run it yourself:

- Quick look: `npm start demo demo-fast`
- Full run: `npm start demo todo-app`
