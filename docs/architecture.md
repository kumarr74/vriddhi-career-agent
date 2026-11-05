# Design decisions

## Security
- Human Azure administrator is NOT the runtime identity.
- User-assigned managed identity handles Key Vault / resource auth.
- Vault Secrets User is read-only; future per-agent separation can narrow access.
- External job descriptions are untrusted input; treat prompt injection as hostile.
- Never bypass CAPTCHA, create fabricated answers, or submit to disallowed sites.

## Job lifecycle
- NEW -> APPROVED / HOLD / REJECTED / MANUAL
- APPROVED -> IN_PROGRESS -> SUBMITTED only with positive confirmation
- Any ambiguous submission -> UNCERTAIN / MANUAL; no blind retries
- REJECTED retained for deduplication and hidden from daily list
- HOLD remains on daily list

## Storage
- Local SQLite only in development. Azure SQL with SQLAlchemy compatible driver later.
- In production record both approval event and exactly which KB versions were used.
- Store CV binaries in Blob Storage with least-privilege access, not in SQL.
- Detailed application audit is separate from applicant recruitment stage.
