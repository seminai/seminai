# Contributing to seminai-be-v2

> **Note:** This project is currently **single-author**. This document is
> **optional future-proofing** — it defines the terms under which external
> contributions (if any) are accepted, so that the dual-license business model
> stays legally clean. If you are the sole maintainer you can ignore the
> day-to-day workflow, but the **licensing terms in the "Contribution license"
> section remain the policy** for any third-party contribution.

## How to propose a change

1. Branch from the default branch; keep changes focused and atomic.
2. Follow the repo conventions in `CLAUDE.md` (English, max 300 lines/file,
   no `any`, hexagonal layering, one export per file).
3. Ensure **lint and build pass** before opening a PR:
   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   npm test
   ```
4. Open a pull request describing the change and its rationale.

## Contribution license (inbound = outbound + commercial relicensing)

This project is **dual-licensed**: GNU AGPLv3 **or** a separate commercial
license (see [`LICENSE`](./LICENSE) and [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md)).

By submitting a contribution (a pull request, patch, or any code/content) you
agree that:

1. **Inbound = Outbound** — your contribution is provided under the **same
   AGPLv3** terms that cover the project.
2. **Commercial relicensing** — you **grant the copyright holder (Francesco
   Saverio Mazzi) the right to also license your contribution under the
   project's commercial license**, including future versions of it.

This second point is essential: without it, a third-party contribution would be
AGPL-only and could **not** be included in commercially licensed builds — which
would break the project's ability to sell commercial licenses. Do not submit
code you are not entitled to license this way (e.g. code owned by an employer).

## Developer Certificate of Origin (DCO)

Instead of a heavyweight signed CLA, this project uses the lightweight
**Developer Certificate of Origin** — see <https://developercertificate.org/>.

Sign off each commit to certify you wrote the code (or have the right to submit
it) under the terms above:

```bash
git commit -s -m "your message"
```

This appends a `Signed-off-by: Your Name <you@example.com>` trailer to the
commit message.

> If the project ever takes on regular external contributors, upgrade this DCO
> note to an explicit **Contributor License Agreement (CLA)** reviewed by legal
> counsel.
