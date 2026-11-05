# Vriddhi Career Agent - Minimal Azure API Patch (v0.3)

Purpose: Make **Add opportunity**, job listing and approval/hold/reject/manual decisions work on the EXISTING Azure Static Web App, using Azure-managed Functions and Azure Table Storage. No separate Container App, VM or Mini PC runtime is needed.

The existing `backend/` FastAPI prototype is intentionally not deployed. This patch adds an Azure Functions implementation of the same three API endpoints, and keeps the current React portal.

## Prerequisites and safety

- Existing `swa-vriddhi-career-dev` (Static Web App Free plan) deployed from GitHub.
- Resource group `rg-vriddhi-career-dev`.
- Sign in to Azure with your original account that can administer the subscription and Static Web App.
- **Do not save resumes, immigration information, credentials, or sensitive profile data in this MVP**. This patch stores job titles, companies, URLs, optional descriptions and decision/status only.
- **Role-based access is enforced by SWA and the API.** Assign yourself the `career-owner` role and accept the invitation BEFORE pushing the patch. The `/.auth/*` sign-in endpoints remain publicly reachable for login, but the portal and API still require `career-owner`. Anyone without that role will be denied.

## Azure steps (in order)

### 1. Assign yourself the portal's owner role

Azure Portal > your Static Web App `swa-vriddhi-career-dev` > Role management > Invite.

- Provider: Microsoft Entra ID (Azure Active Directory), if prompted.
- Email: the email address that belongs to the Microsoft account you will use to sign in.
- Role: `career-owner` (type the custom role name).
- Send invitation, then open the invitation and accept it using the **same identity**.

Important: **Generate** creates an invitation URL. Copy that generated URL and open it in a browser while signed in as the invited identity. This confirms acceptance. The login URL later will be `https://YOUR-SWA-HOST/.auth/login/aad`. An invitation is not complete merely because you clicked Generate.

### 2. Create a low-cost Storage account and table

Azure Portal > Storage accounts > Create:

- Subscription: startup-credit subscription
- Resource group: `rg-vriddhi-career-dev`
- Name: an available globally unique lowercase name such as `stvriddhicareerdev01`
- Region: East US (or same region as current SWA, where supported)
- Performance: Standard; Redundancy: Locally redundant (LRS)
- Leave other settings on secure defaults. Review pricing before creating.

Once provisioned, navigate to Storage account > Storage browser > Tables > Add table, name **`CareerJobs`** (exact capitalization). Do not enable anonymous blob access.

### 3. Add private connection string to Static Web App

Azure Portal > Storage account > Security + networking > Access keys > Show connection string for `key1` > **Copy**.

Azure Portal > `swa-vriddhi-career-dev` > Settings > Environment variables (sometimes called Configuration) > Production > Add:

- Name: `CAREER_STORAGE_CONNECTION_STRING`
- Value: the copied Azure Storage **connection string** (NOT the access key alone)

Save. **Never paste this value in a chat, source file, screenshot or GitHub.** The managed Functions API does not support user-assigned managed identities for data access; this secret is held in SWA's encrypted backend application settings.

### 4. Copy the patch into your cloned GitHub repo

Extract the ZIP and merge its contents into your existing cloned repository, preserving the paths. It adds:

```
api/
  host.json
  package.json
  src/functions/jobs.js
frontend/public/staticwebapp.config.json
frontend/src/main.jsx   (replaces the original to show useful API errors)
```

Do not delete the existing frontend or backend files. Note: `frontend/public/` may be new; create it as necessary.

### 5. Enable API deployment in the existing GitHub workflow

Open `.github/workflows/azure-static-web-apps-*.yml` (keep the existing exact filename). Find the deployment action section and set:

```yaml
app_location: "/frontend"
api_location: "api"
output_location: "dist"
```

Do not change GitHub secret names, action tokens, or other generated workflow fields.

### 6. Push, then validate

GitHub Desktop > Commit to main (message `Add secured Azure jobs API`) > Push origin. Wait for the **Azure Static Web Apps CI/CD** GitHub Action to succeed.

Open the site, authenticate with the invited owner account, then test:

- `https://YOUR-SWA-HOST/api/health` should show a JSON object with `status: ok` after login.
- `https://YOUR-SWA-HOST/api/jobs` should show JSON `[]` initially.
- In the portal, enter Title + Company + Job URL, click Add opportunity. The job should appear.
- Set status to Approved or Hold. Refresh the page; the saved status should persist.
- Try adding the same URL twice; it should be refused as a duplicate.

## Common failures

- API responds `404` or frontend gives `unexpected end of JSON`: GitHub workflow still has empty `api_location`, or API build failed.
- API responds `403`: the account has not accepted the `career-owner` invitation, or was signed in through the wrong provider/account.
- API responds `503` with job-storage message: missing/invalid `CAREER_STORAGE_CONNECTION_STRING`, or `CareerJobs` table not created.
- You see the Azure welcome page instead of the portal: frontend build/deploy has not succeeded.

## Scope limitations

The original local FastAPI server under `backend/` is not used by this Static Web Apps deployment. This release does **not** fetch job descriptions automatically, tailor resumes, store personal KBs, submit job applications, or automate career searches. It only makes the existing job intake and review workflow function reliably in Azure.

Microsoft official docs:
- https://learn.microsoft.com/en-us/azure/static-web-apps/add-api
- https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions
- https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization
- https://learn.microsoft.com/en-us/azure/static-web-apps/application-settings
