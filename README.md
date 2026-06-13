# CPF Builder Wealth App

Full-stack CPF (Singapore) planning dashboard for financial advisors & HR teams.
Monorepo: `web/` (Next.js 16) + `api/` (FastAPI) + Postgres (Docker).

Design spec: `docs/superpowers/specs/2026-06-09-cpf-builder-design.md`
Build plan:  `docs/superpowers/plans/2026-06-09-cpf-phase-0-1.md`

## One-time setup

### 1. Docker Desktop (for Postgres)
Run `scripts/install-docker.ps1` **as Administrator** (installs WSL2 + Docker
Desktop system-wide), then **reboot**. Launch Docker Desktop once and wait for
"Engine running". If it complains about virtualization, enable Intel VT-x / AMD-V
in BIOS/UEFI.

### 2. Start Postgres
```powershell
docker compose up -d
```

### 3. API (FastAPI)
```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head        # creates + seeds tables (needs Postgres running)
uvicorn app.main:app --reload   # API on http://localhost:8000
```

### 4. Web (Next.js)
```powershell
cd web
npm install
npm run dev                 # http://localhost:3000
```

Verify: open http://localhost:3000/health → should show **API: ok**.

## Tests
```powershell
cd api
.\.venv\Scripts\Activate.ps1
pytest -v                   # uses in-memory SQLite; no Docker required
```
