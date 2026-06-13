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

### Administrator mode

On the **Clients** page, click **Administrator sign in** to unlock client deletion.

```
ID:       useradmin
Password: P@ssw0rd2022
```

> ⚠️ This is a lightweight client-side gate for a local tool, **not real authentication** — the
> credentials live in the browser bundle and the delete API is unprotected. Add server-side auth
> before exposing this app beyond a trusted machine.

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
