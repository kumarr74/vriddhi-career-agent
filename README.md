# Vriddhi Career Agent - Phase 1 Starter

This is a functional *local-development prototype* of the morning job review portal. It is **not yet a production-deployable career agent**. It includes:

- FastAPI API and SQLAlchemy database models
- React/Vite job review dashboard
- Manual intake of job postings for testing
- Approve, Hold, Do not apply, and Manual states
- Duplicate detection by original job URL
- Rejected jobs hidden from the default list (not deleted)
- Initial Dockerfile for packaging

**Not implemented yet:** secure portal login, cloud database, Agent 1 automated scouting, Agent 2 applications, knowledge bases and credentials, Agent 4 reports, or Azure-specific deployments. No real applications are submitted.

## Run locally

Prerequisites: Python 3.12+, Node.js 22+, npm.

Terminal A:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal B:

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. API documentation: http://127.0.0.1:8000/docs.

The local SQLite database (`backend/career_agent_dev.sqlite3`) is excluded from Git.

## Security and Azure deployment gate

DO NOT publicly deploy this starter as-is. It intentionally lacks end-user auth and durable Azure database configuration.

Before cloud deployment:

1. Add Microsoft Entra ID authentication to Azure Container Apps with "Require authentication".
2. Explicitly authorize only your tenant/account (and preferably enforce an app allowlist).
3. Provision an Azure-managed durable database and update DATABASE_URL; production startup refuses local SQLite.
4. Assign the existing user-assigned identity `id-vriddhi-career-agent-dev` to the container app, and verify Key Vault access.
5. Add CSRF protection and job action authorization checks beyond the platform auth boundary.
6. Restrict ingress and activate audit logging, backup, and retention controls.
7. Use GitHub federated credentials or another approved deployment identity; never paste keys into Git.
8. Never store job website credentials, CVs or sensitive legal information until those safeguards are configured.

## Azure setup already completed (reported by owner)

- RG: rg-vriddhi-career-dev (East US metadata)
- Key Vault: kv-vriddhi-career-dev (verify exact name)
- Managed identity: id-vriddhi-career-agent-dev
- Managed identity assigned Key Vault Secrets User
- $50/month Azure budget (alerts, not a spend cap)

## Delivery roadmap

MVP 1A: local review portal and workflow states (this package)
MVP 1B: Entra auth, Azure SQL, Azure Container Apps, GitHub deployment
MVP 1C: Agent 3 knowledgebase and resume upload
MVP 1D: Agent 1 automated scouting with compliant source integrations
MVP 2: Agent 2 user-approved job applications with evidence and manual exceptions
MVP 3: Agent 4 reporting and analytics
