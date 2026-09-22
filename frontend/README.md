# seminai-fe-v3

Frontend of **Seminai** — the AI-assisted agronomic management platform. Built
with **React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui + TanStack Query +
TanStack Router**. It consumes the REST API exposed by `seminai-be-v2`.

## Development

```bash
npm run dev              # dev server (port 5173)
npm run build            # production build
npm run type-check       # TypeScript check (tsc --noEmit)
npm run lint             # ESLint
npm run prisma:generate  # copy BE schema + generate types
npm run api:generate     # export swagger + generate API hooks (Orval)
```

> Auto-generated code (`src/generated/`, `src/routeTree.gen.ts`) must not be
> edited by hand. See `CLAUDE.md` for architecture and conventions.

## License

This software is released under a **dual license**.
Copyright (c) 2024-2026 Francesco Saverio Mazzi <francemazzi@gmail.com>.

You may use it, at your option, under ONE of:

1. **GNU AGPL v3** (free) — use, study, modify and redistribute the code,
   provided any derivative you distribute is also released as open source under
   the AGPLv3 (copyleft). As an **Affero** license, if you run a modified
   version as a network service (SaaS) you must also make its complete source
   code available to that service's users (see Section 13). Full text in
   [`LICENSE`](./LICENSE).

2. **Commercial license** — required for any use the AGPLv3 does not allow
   (proprietary/closed-source products, derivatives distributed without their
   source, or running a modified version as a SaaS without sharing the source).
   For any commercial or proprietary use you must first **ask for permission**
   and obtain a written license from the copyright holder:

   **Francesco Saverio Mazzi** — [francemazzi@gmail.com](mailto:francemazzi@gmail.com)

   Details in [`COMMERCIAL-LICENSE.md`](./COMMERCIAL-LICENSE.md).
