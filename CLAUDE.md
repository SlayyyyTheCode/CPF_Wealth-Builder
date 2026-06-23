# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Setup
```bash
# Install Python dependencies (from api/)
pip install -r requirements.txt

# Install Node dependencies (from web/)
npm install
```

### Development
```bash
# Backend: Start FastAPI server (from api/)
uvicorn app.main:app --reload

# Frontend: Start Next.js dev server (from web/)
npm run dev
# Runs on http://localhost:3000
```

### Build & Test
```bash
# Backend: Run pytest suite (from api/)
pytest tests/
# Run single test file
pytest tests/test_simulation.py -v
# Run single test
pytest tests/test_simulation.py::test_cpf_contribution_flow -v

# Frontend: Lint (from web/)
npm run lint
# Build for production
npm run build
```

### Database
```bash
# Backend: Run Alembic migrations (from api/)
alembic upgrade head
# Create new migration
alembic revision --autogenerate -m "description"
```

## Architecture

### Core Concept: Time-Series Simulation

The system models CPF accounts through monthly simulation loops. Each month progresses salary → contributions → allocation routing → interest compounding → policy checks. State is deterministic and reproducible.

**Retirement Sums (AY2026)**:
- BHS (Basic Healthcare Sum): $79,000
- FRS (Full Retirement Sum): $220,400
- ERS (Enhanced Retirement Sum): $440,800

**CPF Accounts**: OA (Ordinary), SA (Special), MA (Medical), RA (Retirement at age 55+)

**Interest Rates**: OA 2.5%, SA/MA/RA 4%

### Project Structure

#### Backend: `api/`

**FastAPI app** — Python 3.11+, SQLAlchemy ORM, PostgreSQL + Alembic migrations, Anthropic Claude for policy ingestion.

```
api/
├── app/
│   ├── main.py                 # FastAPI app factory, route includes
│   ├── core/config.py          # Settings (CORS, env vars)
│   ├── engines/                # Core CPF simulation (7 modular engines)
│   │   ├── contribution.py     # Salary + contribution allocation
│   │   ├── allocation.py       # Age-based OA/SA/MA routing
│   │   ├── overflow.py         # MA/SA overflow rules + FRS state machine
│   │   ├── interest.py         # Monthly interest compounding
│   │   ├── retirement.py       # Age 55 RA transition + CPF LIFE
│   │   └── ...
│   ├── db/                     # SQLAlchemy models + session
│   │   ├── base.py             # Base ORM class
│   │   ├── session.py          # get_db() dependency
│   │   └── ...
│   ├── models/                 # Database ORM tables
│   │   ├── member.py           # Member, MemberProjection
│   │   ├── simulation.py       # SimulationSnapshot
│   │   ├── policy.py           # PolicySnapshot (versioned)
│   │   └── ...
│   ├── routers/                # API endpoints
│   │   ├── member.py           # POST /members, GET /members/{id}
│   │   ├── simulation.py       # POST /members/{id}/simulate
│   │   ├── analysis.py         # GET /analysis (age of milestones, readiness)
│   │   ├── policy.py           # GET /policies, POST /policies (admin)
│   │   ├── auth.py             # Authentication stubs
│   │   └── maintenance.py      # /health, schema reset
│   ├── schemas/                # Pydantic response models
│   ├── policy/                 # Policy versioning + SEED_2026
│   └── ai/                     # Claude-powered PDF ingestion + extraction
├── tests/                      # pytest suite (138 tests green)
│   ├── conftest.py             # In-memory SQLite + fixtures
│   ├── test_simulation.py      # Core engine tests
│   ├── test_ai_*.py            # AI extraction tests
│   └── ...
├── alembic/                    # DB migration history
├── pyproject.toml              # Project metadata + FastAPI entry
└── requirements.txt            # Python deps (pytest, anthropic, etc.)
```

**Key Engines** — conceptual; exact module names in `api/app/engines/`:
1. **Contribution**: Monthly salary input → employee + employer CPF contributions
2. **Allocation**: Routes contributions into OA/SA/MA based on age bands (policy-driven)
3. **Overflow**: Handles MA → SA → OA cascade; tracks FRS achievement state
4. **Interest**: Applies monthly compound interest per account type
5. **Retirement**: Age 55 trigger; RA formation; CPF LIFE projections
6. **Policy**: Loads & applies versioned policy rules (from `policy/seed.py`)
7. **AI Ingestion**: Anthropic Claude extracts policy updates from PDFs

#### Frontend: `web/`

**Next.js 16.2.7 + React 19 + TypeScript + TailwindCSS v4**.

```
web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Home / client roster
│   │   ├── clients/[id]/       # Client dashboard
│   │   │   ├── page.tsx        # Overview (net worth, milestones)
│   │   │   ├── oa/page.tsx     # OA account drilldown
│   │   │   ├── sa/page.tsx     # SA account drilldown
│   │   │   ├── medisave/       # Medisave projections
│   │   │   ├── settings/       # Client config + salary input
│   │   │   ├── optimisation/   # Tax relief + tax scenarios
│   │   │   ├── milestones/     # Age of BHS/FRS/ERS achievement
│   │   │   └── layout.tsx      # Client route wrapper
│   │   └── admin/              # Admin pages
│   │       └── policy/         # Policy upload + review
│   ├── components/             # 45+ React components
│   │   ├── net-worth-chart.tsx
│   │   ├── cpf-life-card.tsx
│   │   ├── milestone-timeline.tsx
│   │   ├── readiness-ring.tsx  # Retirement readiness score (%)
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts              # Fetch wrapper; base URL + error handling
│   │   ├── store.ts            # Zustand client state (selected member, etc.)
│   │   ├── types.ts            # TypeScript interfaces (Member, SimulationData)
│   │   └── format.ts           # Number/date formatters
│   └── styles/                 # TailwindCSS (v4 uses @import in CSS)
├── package.json                # npm run dev / build / lint
├── next.config.ts              # Next.js config
├── tsconfig.json               # TypeScript strict mode
└── eslint.config.mjs           # ESLint 9.x config
```

**Routes** (7 main):
- `/` — Client roster + create member
- `/clients/[id]` — Overview (net worth, CPF LIFE projection, milestones)
- `/clients/[id]/oa` — OA account details + early withdrawal projections
- `/clients/[id]/sa` — SA balance + drawdown scenarios
- `/clients/[id]/medisave` — Medisave growth + adequacy check (MediShield Life cost)
- `/clients/[id]/settings` — Salary input, contribution rates, personal data
- `/clients/[id]/optimisation` — Tax relief strategies + scenario comparison

**State Management**: Zustand (minimal; mostly API-driven). Selected member ID in store; rest loaded from backend on route change.

### Policy-Driven Design

**All CPF rules must be configurable.** No hardcoded thresholds in business logic.

Policy version = immutable snapshot (timestamped, approved). Each simulation pins to one policy version. Policy fields:
- Contribution rates (%)
- Allocation bands (age → OA/SA/MA split %)
- BHS/FRS/ERS values
- Interest rates
- Overflow rules
- CPF LIFE parameters

**Seed policy** lives in `api/app/policy/seed.py` (SEED_2026). This is auto-activated on first db init via `conftest.py`.

### Critical State Rules

**FRS is a state machine**, not a static value:
- Moving target: grows yearly until age 55
- **Achievement flag**: Once first achieved (SA ≥ FRS), it becomes a persistent flag
- **Consequence**: After FRS achieved, MA overflow routes to OA only; SA no longer receives MA overflow

This is why simulation state is stateful—FRS achievement changes future behavior.

**Overflow cascade** (critical for MA/SA management):
- MA < BHS → stays in MA
- MA ≥ BHS → overflows to SA
- SA < FRS → stays in SA
- SA ≥ FRS (and FRS achieved) → overflows to OA only
- SA ≥ FRS (and FRS not yet achieved) → overflows to OA

## Development Patterns

### Adding a New Feature

1. **Identify the engine.** Does it belong in contribution (salary flow), allocation (age routing), overflow (cascade), interest (compounding), retirement (RA/CPF LIFE), or policy (rule loading)?
2. **Write backend test first** (if not already covered). Use `pytest` in `api/tests/`.
3. **Implement in engine module**, not in router.
4. **Add API endpoint** in `api/app/routers/` if needed.
5. **Consume in frontend.** Update `web/src/lib/api.ts` (fetch wrapper) if new endpoint, then add React component + page.

### Modifying CPF Rules

1. **Never hardcode thresholds** (BHS, FRS, interest rates, etc.) in engine code.
2. **Update `api/app/policy/seed.py`** (SEED_2026 dict).
3. **Run `alembic revision --autogenerate`** if schema changed.
4. **Bump policy version** in seed (timestamp + version field).
5. **Test backward compatibility**: old simulations should still use old policy; new ones use new seed.

### Testing Workflow

- **Backend**: `pytest tests/test_simulation.py -v` for core logic. `pytest tests/test_ai_*.py` for AI extraction.
- **Frontend**: Manual in-browser (Next.js HMR is fast). Lint with `npm run lint`.
- **Integration**: Run dev servers (`uvicorn` + `npm run dev`), hit http://localhost:3000, verify dashboards reflect backend changes.

### Database Migrations

- **Schema change?** Run `alembic revision --autogenerate -m "descriptive message"` from `api/` to generate migration file.
- **Review the generated `.py` file** in `api/alembic/versions/` — ensure SQL is correct.
- **Apply: `alembic upgrade head`** to run migrations locally.

## Dependency Versions

**Pinned to specific ranges** in `pyproject.toml` and `web/package.json` to avoid surprise breaking changes. When updating:
1. Update version in `pyproject.toml` / `package.json`.
2. Run `pip install` / `npm install` to refresh lock.
3. Test the feature that depends on the updated package.

## Notes

- **Memory persistence**: See `C:\Users\B3n\.claude\projects\...\memory\` for multi-session context (project state, architecture notes).
- **Caveman mode active**: This repo uses terse communication patterns. `/caveman lite|full|ultra` to adjust intensity.
- **Next.js breaking changes**: `web/AGENTS.md` warns that this Next.js version has breaking changes vs. training data. Check `node_modules/next/dist/docs/` before assuming standard Next.js patterns apply.
- **Database**: Production uses PostgreSQL; tests use in-memory SQLite (`conftest.py`). Both backends must be tested before merge.
