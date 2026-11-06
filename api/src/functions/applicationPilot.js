'use strict';

// Career Agent pilot: profile storage and truthful, deterministic application preparation.
// Uses the existing CAREER_STORAGE_CONNECTION_STRING and requires career_owner access.
const { app } = require('@azure/functions');
const { TableClient, TableServiceClient } = require('@azure/data-tables');
const crypto = require('node:crypto');

const TABLE_NAME = 'CareerProfiles';
const RECORD_KEY = 'master_v1';
const MAX_PROFILE_BYTES = 28000; // Lower than Azure Table Storage's per-property 64 KiB UTF-16 limit.
const MAX_DESCRIPTION_CHARS = 20000;
const respond = (status, payload) => ({status, jsonBody: payload, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});

function ownerPartition(request) {
  const encoded = request.headers.get('x-ms-client-principal');
  if (!encoded) return null;
  try {
    const user = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    // Uses the same SHA-256 account partition strategy as the existing jobs API.
    // Accept both earlier and corrected spelling solely for compatibility with existing invitations.
    if (!user.userId || !Array.isArray(user.userRoles) ||
        !user.userRoles.some(role => role === 'career_owner' || role === 'career-owner')) return null;
    return crypto.createHash('sha256').update(String(user.userId)).digest('hex').slice(0, 32);
  } catch { return null; }
}

function getTableClient() {
  const conn = process.env.CAREER_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error('Storage connection string not configured');
  return TableClient.fromConnectionString(conn, TABLE_NAME);
}

async function createTableIfNeeded() {
  const service = TableServiceClient.fromConnectionString(process.env.CAREER_STORAGE_CONNECTION_STRING);
  try { await service.createTable(TABLE_NAME); }
  catch (error) { if (error.statusCode !== 409) throw error; }
}

function isProfile(profile) {
  return profile && typeof profile === 'object' && !Array.isArray(profile) &&
    profile.schema_version === 1 &&
    typeof profile.summary === 'string' && profile.summary.trim().length > 20 &&
    typeof profile.resume_file === 'string' &&
    profile.identity && typeof profile.identity === 'object' &&
    Array.isArray(profile.achievements) && Array.isArray(profile.experience);
}

async function readProfile(partitionKey) {
  try {
    const row = await getTableClient().getEntity(partitionKey, RECORD_KEY);
    return {profile: JSON.parse(row.profileJson), updated_at: row.updatedAt || ''};
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

function storageError(error, context) {
  context.error('Career Agent pilot storage operation failed', error?.message || String(error));
  return respond(503, {detail: 'Profile storage unavailable. Check the existing Azure Storage configuration.'});
}

app.http('careerProfileGet', {
  route: 'profile', methods: ['GET'], authLevel: 'anonymous',
  handler: async (request, context) => {
    const partition = ownerPartition(request);
    if (!partition) return respond(403, {detail: 'Please sign in with your invited Career Agent owner account.'});
    try { return respond(200, (await readProfile(partition)) || {profile: null, updated_at: null}); }
    catch (error) { return storageError(error, context); }
  }
});

app.http('careerProfilePut', {
  route: 'profile', methods: ['PUT'], authLevel: 'anonymous',
  handler: async (request, context) => {
    const partition = ownerPartition(request);
    if (!partition) return respond(403, {detail: 'Please sign in with your invited Career Agent owner account.'});
    let body;
    try { body = await request.json(); } catch { return respond(400, {detail: 'Upload a valid JSON profile file.'}); }
    const profile = body?.profile;
    if (!isProfile(profile)) return respond(400, {detail: 'The profile is missing required fields (schema_version, summary, resume_file, identity, achievements, experience).'});
    const encoded = JSON.stringify(profile);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_PROFILE_BYTES || Buffer.byteLength(encoded, 'utf16le') > 58000) {
      return respond(413, {detail: 'The profile is too large for this lightweight pilot. Please reduce its length.'});
    }
    try {
      await createTableIfNeeded();
      const now = new Date().toISOString();
      await getTableClient().upsertEntity({partitionKey: partition, rowKey: RECORD_KEY,
        profileJson: encoded, updatedAt: now, schemaVersion: 1}, 'Replace');
      return respond(200, {saved: true, updated_at: now,
        resume_file: profile.resume_file, experience_count: profile.experience.length});
    } catch (error) { return storageError(error, context); }
  }
});

function words(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9+.#-]*/g) || []);
}

function rankAchievements(profile, title, description) {
  const corpus = words(`${title || ''} ${description || ''}`);
  return (profile.achievements || [])
    .filter(a => a && typeof a.text === 'string' && a.text.length > 12)
    .map((item, index) => {
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const score = tags.reduce((total, tag) => {
        const tokens = [...words(tag)];
        return total + tokens.filter(token => corpus.has(token)).length * 3;
      }, 0) + [...words(item.theme)].filter(token => corpus.has(token)).length;
      return { ...item, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function chooseFocus(rank, jobTitle) {
  return rank.length && rank[0].score > 0 ? rank[0].theme : (jobTitle || 'technology transformation');
}

function assemblePacket(job, profile, description) {
  const ranked = rankAchievements(profile, job.title, description);
  const selected = ranked.slice(0, 4);
  const focus = chooseFocus(ranked, job.title);
  const name = String(profile.identity?.full_name || 'Candidate').trim();
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const why = `The ${title} opportunity at ${company} aligns with my background in ${focus}. ` +
    `I bring experience spanning enterprise architecture, technology transformation, cloud modernization and cross-functional leadership. ` +
    `I would welcome the opportunity to discuss how these capabilities can support the priorities outlined in this role.`;
  const comp = (profile.preferences?.compensation || 'Depends on the role; confirm individually.');
  const start = (profile.preferences?.start || 'Confirm availability for this application.');
  const relocation = (profile.preferences?.relocation || 'Confirm relocation for this role.');
  const contact = (profile.preferences?.employer_contact || 'Confirm employer contact preference.');
  const summary = profile.summary.trim();
  const bullets = selected.map(a => `${a.text} (${a.employer || 'Experience'})`);
  const advisories = [
    'Review all generated wording against the actual job description and your approved CV.',
    'Company-specific motivation is not researched; tailor the Why Company answer before using it.',
    'Do not automatically answer citizenship, visa/sponsorship, salary amounts, legal or EEO questions.',
    'Do not accept declarations, consent to background checks, or submit applications automatically.'
  ];
  if (!description.trim()) advisories.unshift('Paste the actual job description for a more useful achievement match. This draft uses the job title only.');
  return {
    job_id: job.rowKey, title, company, source_url: job.sourceUrl,
    resume: profile.resume_file, candidate: name,
    summary,
    why_role: why,
    why_company: `I am interested in learning how ${company} is approaching the goals behind its ${title} position. ` +
      `My experience in ${focus} is relevant to the work described. [Add one verified company-specific reason before submitting.]`,
    relevant_achievements: bullets,
    reusable_answers: {
      start_availability: start,
      work_arrangement: profile.preferences?.work_arrangement || 'Confirm for this role',
      relocation,
      compensation: comp,
      employer_contact: contact,
      certificates: profile.certification_url || 'Confirm exact certificate names'
    },
    advisories,
    generated_at: new Date().toISOString(),
    method: 'rules-based CV matching (no external AI model; not submitted)'
  };
}

app.http('careerApplicationPrepare', {
  route: 'applications/prepare', methods: ['POST'], authLevel: 'anonymous',
  handler: async (request, context) => {
    const partition = ownerPartition(request);
    if (!partition) return respond(403, {detail: 'Please sign in with your invited Career Agent owner account.'});
    let body;
    try { body = await request.json(); } catch { return respond(400, {detail: 'Invalid JSON request.'}); }
    if (!/^[0-9a-f]{64}$/.test(body?.job_id || '')) return respond(400, {detail: 'Select a saved opportunity first.'});
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (description.length > MAX_DESCRIPTION_CHARS) return respond(413, {detail: 'Job description exceeds 20,000 characters.'});
    try {
      const stored = await readProfile(partition);
      if (!stored) return respond(409, {detail: 'Import and save your career profile first.'});
      let job;
      try { job = await TableClient.fromConnectionString(process.env.CAREER_STORAGE_CONNECTION_STRING, 'CareerJobs').getEntity(partition, body.job_id); }
      catch (error) { if (error.statusCode === 404) return respond(404, {detail: 'This opportunity was not found in your job list.'}); throw error; }
      return respond(200, assemblePacket(job, stored.profile, description));
    } catch (error) { return storageError(error, context); }
  }
});

// Export pure functions so the pilot can be validated without an Azure subscription.
module.exports = {isProfile, rankAchievements, assemblePacket, ownerPartition};
