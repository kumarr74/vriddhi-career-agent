'use strict';

const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');
const crypto = require('node:crypto');

const TABLE_NAME = 'CareerJobs';
const ALLOWED_DECISIONS = new Set(['approved', 'rejected', 'hold', 'manual']);

function respond(status, payload) {
  return { status, jsonBody: payload, headers: { 'Cache-Control': 'no-store' } };
}

function getPrincipal(request) {
  const encoded = request.headers.get('x-ms-client-principal');
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function access(request) {
  const principal = getPrincipal(request);
  if (!principal || !principal.userId || !Array.isArray(principal.userRoles) || !principal.userRoles.includes('career_owner')) {
    return null;
  }
  return crypto.createHash('sha256').update(String(principal.userId)).digest('hex').slice(0, 32);
}

function client() {
  const connectionString = process.env.CAREER_STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error('CAREER_STORAGE_CONNECTION_STRING is not configured');
  return TableClient.fromConnectionString(connectionString, TABLE_NAME);
}

function normalizeURL(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function jobResult(entity) {
  return {
    id: entity.rowKey,
    title: entity.title,
    company: entity.company,
    source_url: entity.sourceUrl,
    description: entity.description || '',
    status: entity.status,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
}

function errorResponse(error, context) {
  context.error('Job API operation failed', error.message);
  if (error.statusCode === 404) return respond(404, { detail: 'Job not found' });
  if (error.statusCode === 409) return respond(409, { detail: 'Job source URL is already tracked' });
  return respond(503, { detail: 'Job storage is unavailable; check the Azure Storage configuration' });
}

app.http('jobsList', {
  methods: ['GET'],
  authLevel: 'anonymous', // The SWA route and the principal check enforce authentication.
  route: 'jobs',
  handler: async (request, context) => {
    const partitionKey = access(request);
    if (!partitionKey) return respond(403, { detail: 'Sign in with your invited career-owner account' });
    try {
      const all = [];
      const table = client();
      for await (const entity of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}'` } })) {
        if (request.query.get('show_rejected') === 'true' || entity.status !== 'rejected') all.push(jobResult(entity));
      }
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      return respond(200, all);
    } catch (error) {
      return errorResponse(error, context);
    }
  }
});

app.http('jobsCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'jobs',
  handler: async (request, context) => {
    const partitionKey = access(request);
    if (!partitionKey) return respond(403, { detail: 'Sign in with your invited career-owner account' });
    let body;
    try { body = await request.json(); } catch { return respond(400, { detail: 'Invalid JSON request' }); }
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    const sourceUrl = normalizeURL(body?.source_url);
    const description = typeof body?.description === 'string' ? body.description : '';
    if (title.length < 3 || title.length > 300 || company.length < 2 || company.length > 240 || !sourceUrl || description.length > 20000) {
      return respond(400, { detail: 'Provide a valid title, company and HTTP(S) job URL' });
    }
    const rowKey = crypto.createHash('sha256').update(sourceUrl).digest('hex');
    const now = new Date().toISOString();
    const entity = { partitionKey, rowKey, title, company, sourceUrl, description, status: 'new', createdAt: now, updatedAt: now };
    try {
      await client().createEntity(entity);
      return respond(201, jobResult(entity));
    } catch (error) {
      return errorResponse(error, context);
    }
  }
});

app.http('jobsDecision', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'jobs/{id}/decision',
  handler: async (request, context) => {
    const partitionKey = access(request);
    if (!partitionKey) return respond(403, { detail: 'Sign in with your invited career-owner account' });
    const id = request.params.id;
    if (!/^[0-9a-f]{64}$/.test(id)) return respond(404, { detail: 'Job not found' });
    let body;
    try { body = await request.json(); } catch { return respond(400, { detail: 'Invalid JSON request' }); }
    if (!ALLOWED_DECISIONS.has(body?.status)) return respond(400, { detail: 'Invalid decision' });
    try {
      const table = client();
      const entity = await table.getEntity(partitionKey, id);
      if (!['new', 'approved', 'rejected', 'hold', 'manual'].includes(entity.status)) {
        return respond(409, { detail: 'An active application cannot be changed here' });
      }
      entity.status = body.status;
      entity.updatedAt = new Date().toISOString();
      await table.updateEntity(entity, 'Merge');
      return respond(200, jobResult(entity));
    } catch (error) {
      return errorResponse(error, context);
    }
  }
});

app.http('careerHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (request) => {
    if (!access(request)) return respond(403, { detail: 'Sign in with your invited career-owner account' });
    return respond(200, { status: 'ok', service: 'vriddhi-career-agent-azure-api', environment: 'azure' });
  }
});
