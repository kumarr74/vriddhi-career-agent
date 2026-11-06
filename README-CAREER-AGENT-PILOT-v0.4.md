# Vriddhi Career Agent - Application Preparation Pilot v0.4

## What you get

A deliberately small Azure-first update to the **existing working Career Agent**:

1. Keep all existing **Add Opportunity**, approve/hold/manual/reject, and duplicate-tracking behavior.
2. **Import your master profile once** from a local JSON file and save it to your account's Azure Table Storage partition.
3. Select a saved opportunity, **paste its job description**, and generate a copy-ready application brief with a role-relevant career summary, verified achievements, and draft answers.
4. Copy an individual answer, copy the entire brief, or save the brief as TXT; **you submit the application yourself**.

The first pilot uses **rules-based skill/achievement matching, not an AI model**. It makes no calls to Foundry or to job websites. It does not crawl job URLs, generate modified PDFs, fill browser forms, or submit applications. We add those only after this workflow proves useful.

## IMPORTANT - Two separate downloads

- `Vriddhi_Career_Agent_Application_Pilot_Patch_v0_4.zip` is **CODE ONLY**; merge its 3 code files into the local cloned GitHub repository.
- `Vriddhi_Career_Agent_PROFILE_IMPORT_PRIVATE.json` contains your **personal information**; **never add it to the GitHub repository or commit it**. Keep it only on your private computer, review, and import it in the deployed portal.

The personal profile is derived from the latest November 2026 CV and your verified questionnaire choices (all work arrangements, flexible relocation, compensation depends on role, employer contact with approval, immediate start). It excludes legal/immigration, EEO, and voluntary-disclosure responses.

## Steps - deploying the patch in Azure

**Do not change Azure resources, environment variables, identity roles, or your existing GitHub workflow.** We reuse the Azure Static Web App and its managed Functions API, `CAREER_STORAGE_CONNECTION_STRING`, and Storage account `stvriddhicareerdev`.

### 1 - Merge three code files into the local GitHub clone

Open your cloned repository in Windows File Explorer:

`C:\Main\Platforms\Vriddhi-Career-Agent\GH\vriddhi-career-agent`

Extract the code ZIP somewhere else, then copy these paths from the extracted ZIP into the matching repo locations:

```
api/src/functions/applicationPilot.js     (NEW file)
frontend/src/main.jsx                     (REPLACE existing)
frontend/src/styles.css                   (REPLACE existing)
```

The patch also contains this README. Optionally copy it to `docs/`.

**Keep unchanged**:
- `.github/workflows/azure-static-web-apps-blue-smoke-094f91d0f.yml`
- `frontend/public/staticwebapp.config.json` (it already has your GitHub login and `career_owner` role)
- `api/src/functions/jobs.js`
- `api/package.json`, `api/host.json`
- The existing Azure Storage connection string setting.

### 2 - Commit and deploy

1. Open **GitHub Desktop**; select `vriddhi-career-agent` and fetch/pull recent remote changes if any.
2. Review the changed files. Ensure **the private profile JSON is NOT in the Changes list**.
3. Commit with message `Pilot application preparation and reusable profile`.
4. Use **Push origin**, not **Force Push**. If only Force Push is available, stop and reconcile remote history before pushing.
5. Check the new run on <https://github.com/kumarr74/vriddhi-career-agent/actions>.
6. Open <https://blue-smoke-094f91d0f.3.azurestaticapps.net> after the successful deployment and sign in with your invited GitHub account.

### 3 - Import profile one time

1. Keep `Vriddhi_Career_Agent_PROFILE_IMPORT_PRIVATE.json` **outside the repository**, for example under your personal Documents folder.
2. Open it in Notepad and review contact details, career facts, and preferences before importing.
3. In the portal, open **Master career profile - One-time setup**.
4. Select the private JSON file using **Choose File**. It is initially read **locally in your browser**.
5. Review the name, CV name, and number of employment records shown.
6. Click **Save profile to Azure** to explicitly upload it to your personal profile record.
7. The API will create the `CareerProfiles` table automatically on the first save if it doesn't yet exist. No Azure Portal changes are necessary.

The profile is saved as an account-partitioned record in **Azure Table Storage**. Azure Static Web Apps owner role rules and a separate server-side role check protect the endpoints. Treat this as a private beta, not as a secure vault for passwords or government IDs.

### 4 - Pilot one application

1. On the dashboard, select a saved job and click **Prepare application**, or select it from the pilot dropdown.
2. Open the original job posting from the displayed link, **copy its actual job description and requirements**, and paste them into the Description field.
3. Click **Prepare application brief**.
4. Review the suggested summary, Why this role, Why this company (requires manual tailoring), and achievement bullets.
5. Copy the answer(s) into the real application or download the TXT packet.
6. After you personally submit, track the outcome in your workflow. The pilot never clicks Submit for you.

If no description is pasted, the pilot can still prepare a basic draft using the job title alone, with a warning that match quality is reduced.

### 5 - Minimal security and function checks

- Signed in, `https://blue-smoke-094f91d0f.3.azurestaticapps.net/api/profile` should show your profile object only **after** you save one. It will show `{ "profile": null, "updated_at": null }` before initial save.
- Signed out, run from Windows PowerShell:

```powershell
curl.exe -sS -o NUL -w 'HTTP %{http_code}\n' 'https://blue-smoke-094f91d0f.3.azurestaticapps.net/api/profile'
```

`302` to sign-in, `401`, or `403` are expected. A `200` response containing profile details without authentication is **not acceptable**; stop using the profile and correct authentication.

- `api/health` should still show `status: ok` when signed in.
- Existing jobs and approval buttons should continue to work.

### Troubleshooting

| Symptom | Likely resolution |
| --- | --- |
| `/api/profile` returns 404 | New `applicationPilot.js` wasn't deployed; check file path and current GitHub Actions run |
| Profile save returns 403 | Your GitHub account isn't signed in with the invited `career_owner` role |
| Profile save returns 503 | Check `CAREER_STORAGE_CONNECTION_STRING` and Storage Table availability; existing jobs should still work |
| Save returns 413 | Reduce the private JSON payload; Azure Table Storage imposes property limits |
| No preparation button after green workflow | Refresh browser and verify new `frontend/src/main.jsx` was committed |
| No useful tailored achievements | Paste the full job description; matching is deterministic, not AI-based |
| GitHub Desktop shows Force Push | Do not force push; fetch remote changes or re-clone and reconcile history |

## What to measure during the pilot

Try **three real applications** and record:

- Time to prepare the application with the pilot vs manually.
- Number of facts/answers reused successfully.
- Answers needing edits and missing common questions.
- Sites where manual form entry takes longest.

Then prioritize **browser autofill on a supported portal**, rather than building more dashboards.

## Technical notes

- API: `api/src/functions/applicationPilot.js`, Node 22, Azure Functions v4 programming model.
- New private endpoints: `GET /api/profile`, `PUT /api/profile`, `POST /api/applications/prepare`.
- New storage table: `CareerProfiles`, created on first save via the existing Storage account connection string.
- User isolation: SHA-256 hash of authenticated Azure Static Web Apps principal `userId`, matching the current jobs API pattern; allowed role `career_owner` (legacy `career-owner` supported in API for older invitations).
- No new Azure subscription, VM, Azure SQL, paid LLM, container service or credential setup.
- Private profile file must stay **outside source control**.
