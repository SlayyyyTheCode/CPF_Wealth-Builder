# CPF Wealth Builder

A full-stack planning dashboard for Singapore **CPF** (Central Provident Fund), built for
financial advisors and HR teams. Model a member's CPF accounts decade by decade — projecting
contributions, interest, retirement-sum milestones, MediSave adequacy and CPF LIFE payouts —
and explore "what-if" optimisations, all from a clean pastel UI.

> **Disclaimer:** This is an educational / advisory modelling tool. Figures are estimates based
> on configurable policy assumptions, **not** official CPF Board calculations. CPF LIFE payouts
> in particular are a transparent annuity estimate, not the Board's pooled actuarial figure.

---

## ✨ Features

| Tab | What it does |
|-----|--------------|
| **Overview** | Total CPF now, projected balances at 55 / 65 / 90, net-worth area chart, account breakdown, retirement-readiness score, CPF LIFE estimate, and a contributions-vs-interest growth chart. |
| **Milestones** | When BHS, FRS and ERS are reached, how much more is needed today, plus a forward-projection slider (pick N years → projected target sums). |
| **Medisave (MA)** | Year scrubber: MA balance vs BHS for any year, amount needed to hit BHS, MA interest earned, overflow routing once BHS is hit, and a MediSave-insurance drawdown calculator. |
| **Special Account (SA)** | Year scrubber: progress to FRS / ERS, SA·RA interest and overflow, post-FRS compounding note, and a one-time top-up "what-if" recalculation. |
| **Optimisation** | Scenario analysis, recommended strategies, and 5 tax-reduction calculators (SRS top-up, CPF cash top-up, charity 250% deduction, parent relief, voluntary housing refund). |
| **Settings** | Edit a member's OA / SA / MA / RA balances and profile; changes flow into every projection. |
| **Clients** | Searchable client grid with an **administrator** sign-in that unlocks deleting clients. |

### Simulation engine

A deterministic, monthly-tick state machine (all money in `Decimal`):

```
contributions → allocation (MA → SA/RA → OA) → overflow (one-way, FRS flag)
             → tiered interest → age-55 RA formation → CPF LIFE annuity estimate
```

Policy is **versioned**: contribution / allocation / interest rates, retirement sums, income-tax
brackets, MediShield premiums and growth assumptions live in editable `PolicySnapshot` rows, not
in code. New policy can be ingested from a **PDF** (pluggable AI extractor) and approved by an admin.

---

## 🧱 Tech stack

- **Web** — Next.js 16 (App Router, React 19), TypeScript, Tailwind v4 (CSS-first), Recharts.
- **API** — FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic, pytest.
- **DB** — PostgreSQL (Docker) for production; SQLite for zero-setup local dev and tests.
- **AI** — pluggable policy-PDF extractor (Anthropic SDK; falls back to a fixture extractor when no API key is set).

Monorepo layout:

```
api/    FastAPI service — engines/, routers/, models/, schemas/, policy/, ai/, tests/
web/    Next.js app     — src/app (routes), src/components, src/lib
scripts/ helper scripts (Docker install, etc.)
docker-compose.yml  Postgres for local prod-like runs
```

---

## 🚀 Quick start (SQLite — no Docker)

The fastest way to run everything locally.

**1. API**
```bash
cd api
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then set DATABASE_URL=sqlite:///./cpf_live.sqlite3
alembic upgrade head          # create + seed tables
uvicorn app.main:app --reload # → http://localhost:8000
```

**2. Web** (new terminal)
```bash
cd web
npm install
npm run dev                   # → http://localhost:3000
```

Open **http://localhost:3000**. Health check: **http://localhost:3000/health** → should read *API: ok*.

> On networks with TLS inspection, run the web dev/build with `NODE_OPTIONS=--use-system-ca`.

### Access model & administrator login

**Reads are public** (browse clients, run projections and calculators). **Writes are admin-only**
(create / edit / delete clients, manage policy) and protected by real server-side auth:

- Login (`POST /auth/login`) verifies credentials against server env vars and returns a **JWT**.
- Mutating endpoints require a valid `Authorization: Bearer <token>`; tokens expire.
- Credentials never ship in the browser bundle.

On the **Clients** page, click **Administrator sign in**. Local-dev default: `useradmin` /
`P@ssw0rd2022` (set via `ADMIN_PASSWORD` in `api/.env`). In production set a strong password —
see env vars below.

#### Auth env vars (`api/.env`)

| Var | Purpose |
|-----|---------|
| `ADMIN_USERNAME` | Admin login name (default `useradmin`). |
| `ADMIN_PASSWORD_HASH` | **Production** — bcrypt hash of the password (leave `ADMIN_PASSWORD` empty). |
| `ADMIN_PASSWORD` | Dev convenience plaintext; used only when no hash is set. |
| `JWT_SECRET` | Long random string used to sign tokens — **must** be set in production. |
| `JWT_EXPIRE_MINUTES` | Token lifetime (default 720). |

Generate production secrets:
```bash
python -c "import bcrypt;print(bcrypt.hashpw(b'YOUR_PASSWORD',bcrypt.gensalt()).decode())"  # ADMIN_PASSWORD_HASH
python -c "import secrets;print(secrets.token_urlsafe(48))"                                  # JWT_SECRET
```

---

## 🐘 Production-like run (PostgreSQL via Docker)

```bash
docker compose up -d                       # starts Postgres
cd api
cp .env.example .env                        # keep the postgresql+psycopg DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload
```

If Docker complains about virtualization, enable Intel VT-x / AMD-V in BIOS/UEFI.
`scripts/install-docker.ps1` (run **as Administrator**, then reboot) installs WSL2 + Docker Desktop on Windows.

### Enabling real AI policy ingestion

Set `ANTHROPIC_API_KEY` in `api/.env`. Without it, the app uses a deterministic fixture extractor
(fine for development and tests).

---

## ☁️ Deploy online (any device, anywhere)

Recommended: **Vercel** (web + API) + **Neon** (Postgres) — all free, always-on. The repo
includes the Vercel entrypoint (`api/api/index.py`) and rewrite (`api/vercel.json`) for the API.

### 1. Database — Neon
1. Sign up at **https://neon.tech** (free) → create a project.
2. Copy the **pooled** connection string (looks like
   `postgresql://user:pass@ep-xxx-pooler.<region>.aws.neon.tech/neondb?sslmode=require`).
3. Create the tables once, from your machine:
   ```bash
   cd api
   # set DATABASE_URL to the Neon string (the app auto-pins the psycopg3 driver)
   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" alembic upgrade head
   ```

### 2. API — Vercel (Python serverless)
1. **https://vercel.com** → sign in with GitHub → **Add New… → Project** → import `CPF_Wealth-Builder`.
2. Set **Root Directory = `api`**.
3. Add env vars:
   - `DATABASE_URL` = the Neon pooled string
   - `CORS_ORIGINS` = your web URL (fill after step 3, then redeploy)
   - `ADMIN_PASSWORD_HASH` = bcrypt hash of your admin password (and leave `ADMIN_PASSWORD` unset)
   - `JWT_SECRET` = a long random string
   - `ANTHROPIC_API_KEY` = *(optional, enables AI policy ingestion)*
4. Deploy. Note the API URL, e.g. `https://cpf-wealth-api.vercel.app`. Check `/health` → `{"status":"ok"}`.

### 3. Web — Vercel (Next.js)
1. **Add New… → Project** → import the same repo again → **Root Directory = `web`**.
2. Add env var `NEXT_PUBLIC_API_URL` = your API URL from step 2.
3. Deploy → open the web URL on any phone, tablet or computer. 🎉
4. Go back to the API project and set `CORS_ORIGINS` to this web URL, then redeploy the API.

> The UI is fully responsive (phone / tablet / desktop, light + dark).

### Alternative — Render (one platform)
A Render Blueprint ([`render.yaml`](render.yaml)) provisions Postgres + API + web together:
sign in at **https://render.com**, **New → Blueprint**, pick the repo, **Apply**. (Free tier sleeps
when idle and the free DB expires ~30 days.)

## 🔌 Key API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/members` | List / create members |
| `GET/PUT/DELETE` | `/members/{id}` | Read / update / delete a member |
| `POST` | `/members/{id}/simulate` | Run a projection (supports `override_balances`, `persist`) |
| `POST` | `/members/{id}/analysis` | Scenarios + recommended strategies |
| `POST` | `/tax/estimate`, `/tax/relief` | Stateless tax-saving calculators |
| `POST` | `/policy/ingest` | Extract + diff a policy PDF |
| `GET/POST` | `/policy/snapshots`, `/policy/active`, `/policy/snapshots/{id}/approve` | Policy versioning |

---

## ✅ Tests

```bash
cd api
# Windows: .\.venv\Scripts\python.exe -m pytest -q
pytest -q          # in-memory SQLite, no Docker required
```

Web type-check + production build:
```bash
cd web
npx tsc --noEmit && npm run build
```

---

## 📄 License

No license specified yet — all rights reserved by the author until one is added.
