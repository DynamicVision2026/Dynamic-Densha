# Contributing notes

## Kill the dev server before `git stash` / branch operations

`npm run dev` runs Vite with the TanStack Router file-route plugin, which
watches `src/routes/**` and regenerates a route file's contents (with
placeholder/boilerplate content) if it observes the file changing state —
including a transient change caused by `git stash` / `git stash pop` /
`git checkout` swapping a route file's on-disk content out and back in.

This has happened twice in one work session: a running dev server silently
overwrote `src/routes/app/index.tsx` with router-codegen boilerplate during a
`git stash` used for unrelated verification, discarding real, uncommitted
work in that file. It was caught only because the diff was being inspected
at that exact moment.

**Before any `git stash`, `git checkout <ref> -- <path>`, or branch switch,
kill any running dev server first** (`pkill -f "vite dev"` or equivalent),
and restart it afterward. Never assume a background dev server is inert
during a git operation that touches `src/routes/`.
