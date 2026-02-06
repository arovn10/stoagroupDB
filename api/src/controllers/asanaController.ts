import { Request, Response } from 'express';

const ASANA_API_BASE = process.env.ASANA_API_BASE?.replace(/['"]/g, '').trim() || 'https://app.asana.com/api/1.0';
const DEFAULT_DAYS_AHEAD = 90;
/** Deal Pipeline project GID (same as import scripts). */
const DEFAULT_DEAL_PIPELINE_PROJECT_GID = '1207455912614114';

/** In-memory cache for OAuth access token to avoid refreshing on every request. */
let oauthTokenCache: { accessToken: string; expiresAt: number } | null = null;

/**
 * Get Asana access token: PAT (ASANA_ACCESS_TOKEN / ASANA_PAT) or OAuth refresh (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN / ASANA_REFRESH_TOKEN).
 */
async function getAsanaToken(): Promise<string | null> {
  const pat = process.env.ASANA_ACCESS_TOKEN || process.env.ASANA_PAT;
  if (pat) return pat;

  const clientId = process.env.CLIENT_ID?.replace(/['"]/g, '').trim();
  const clientSecret = process.env.CLIENT_SECRET?.replace(/['"]/g, '').trim();
  const refreshToken = (process.env.REFRESH_TOKEN || process.env.ASANA_REFRESH_TOKEN)?.replace(/['"]/g, '').trim();

  if (!clientId || !clientSecret || !refreshToken) return null;

  // Use cached OAuth token if still valid (with 5 min buffer)
  const now = Date.now();
  if (oauthTokenCache && oauthTokenCache.expiresAt > now + 5 * 60 * 1000) {
    return oauthTokenCache.accessToken;
  }

  try {
    const tokenUrl = 'https://app.asana.com/-/oauth_token';
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message || res.statusText;
      throw new Error(msg || 'Token refresh failed');
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('No access_token in response');

    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    oauthTokenCache = {
      accessToken: data.access_token,
      expiresAt: now + expiresIn * 1000,
    };
    return data.access_token;
  } catch (e) {
    oauthTokenCache = null;
    console.error('[Asana] OAuth token refresh failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

function getDealPipelineProjectGid(): string {
  return process.env.ASANA_PROJECT_GID?.replace(/['"]/g, '').trim() || DEFAULT_DEAL_PIPELINE_PROJECT_GID;
}

function getDefaultWorkspace(): string | undefined {
  return process.env.ASANA_WORKSPACE_GID?.replace(/['"]/g, '').trim();
}

async function fetchAllProjects(token: string, workspaceGid: string): Promise<AsanaProject[]> {
  const projects: AsanaProject[] = [];
  let offset: string | null = null;
  do {
    const params: Record<string, string> = { opt_fields: 'name,gid', limit: '100' };
    if (offset) params.offset = offset;
    const path = `/workspaces/${workspaceGid}/projects?${new URLSearchParams(params)}`;
    const json = await asanaFetch(token, path);
    const batch = (json.data || []) as AsanaProject[];
    projects.push(...batch);
    offset = json.next_page?.offset ?? null;
  } while (offset);
  return projects;
}

interface AsanaProject {
  gid: string;
  name: string;
}

interface AsanaCustomFieldValue {
  gid?: string;
  name?: string;
  type?: string;
  display_value?: string;
  date_value?: { date?: string };
  text_value?: string;
}

interface AsanaTaskRaw {
  gid: string;
  name: string;
  due_on: string | null;
  permalink_url?: string;
  custom_fields?: AsanaCustomFieldValue[];
}

interface UpcomingTask {
  gid: string;
  name: string;
  due_on: string | null;
  start_date: string | null;
  permalink_url: string;
}

/** Extract "Start Date" custom field value (YYYY-MM-DD) or null. */
function getStartDateFromCustomFields(customFields: AsanaCustomFieldValue[] | undefined): string | null {
  if (!customFields || !Array.isArray(customFields)) return null;
  for (const f of customFields) {
    const name = (f.name || '').toLowerCase().trim();
    if (name !== 'start date') continue;
    if (f.date_value?.date) return f.date_value.date;
    if (f.display_value && /^\d{4}-\d{2}-\d{2}$/.test(f.display_value)) return f.display_value;
    return null;
  }
  return null;
}

interface ProjectWithTasks {
  projectGid: string;
  projectName: string;
  tasks: UpcomingTask[];
}

async function asanaFetch(
  token: string,
  path: string
): Promise<{ data?: unknown[]; next_page?: { offset?: string } }> {
  const url = path.startsWith('http') ? path : ASANA_API_BASE + path;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429) {
    throw new Error('Asana rate limit');
  }
  if (res.status === 401) {
    oauthTokenCache = null; // force token refresh on next request
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message || res.statusText;
    throw new Error(msg || 'Asana request failed');
  }

  return res.json() as Promise<{ data?: unknown[]; next_page?: { offset?: string } }>;
}

/** PUT to Asana API (e.g. update task). */
async function asanaPut(
  token: string,
  path: string,
  body: Record<string, unknown>
): Promise<{ data?: Record<string, unknown> }> {
  const url = path.startsWith('http') ? path : ASANA_API_BASE + path;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: body }),
  });

  if (res.status === 429) throw new Error('Asana rate limit');
  if (res.status === 401) oauthTokenCache = null;
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message || res.statusText;
    throw new Error(msg || 'Asana request failed');
  }
  return res.json() as Promise<{ data?: Record<string, unknown> }>;
}

/** Fetch single project details (name) by GID. */
async function fetchProject(token: string, projectGid: string): Promise<AsanaProject | null> {
  const path = `/projects/${projectGid}?${new URLSearchParams({ opt_fields: 'name,gid' })}`;
  const json = await asanaFetch(token, path) as { data?: AsanaProject };
  return json.data ?? null;
}

async function fetchTasksForProject(
  token: string,
  projectGid: string,
  today: string,
  endDate: string
): Promise<UpcomingTask[]> {
  const tasks: UpcomingTask[] = [];
  let offset: string | null = null;

  do {
    const params: Record<string, string> = {
      opt_fields: 'name,due_on,permalink_url,gid,custom_fields',
      opt_expand: 'custom_fields',
      limit: '100',
      completed_since: 'now',
    };
    if (offset) params.offset = offset;

    const path = `/projects/${projectGid}/tasks?${new URLSearchParams(params)}`;
    const json = await asanaFetch(token, path);
    const batch = (json.data || []) as AsanaTaskRaw[];

    for (const t of batch) {
      const startDate = getStartDateFromCustomFields(t.custom_fields);
      const dueInRange = t.due_on != null && t.due_on >= today && t.due_on <= endDate;
      const include = dueInRange || t.due_on == null || startDate != null;
      if (!include) continue;
      tasks.push({
        gid: t.gid,
        name: t.name,
        due_on: t.due_on ?? null,
        start_date: startDate,
        permalink_url: t.permalink_url || `https://app.asana.com/0/0/${t.gid}`,
      });
    }
    offset = json.next_page?.offset ?? null;
  } while (offset);

  return tasks;
}

/**
 * GET /api/asana/upcoming-tasks
 * Query: workspace (optional), project (optional), daysAhead (optional, default 90).
 * When workspace is set (query or ASANA_WORKSPACE_GID): list projects in workspace, fetch tasks per project with start_date from custom field.
 * Otherwise: single Deal Pipeline project (ASANA_PROJECT_GID). Each task includes due_on, start_date (custom "Start Date"), permalink_url.
 */
export async function getUpcomingTasks(req: Request, res: Response): Promise<void> {
  try {
    const token = await getAsanaToken();
    if (!token) {
      res.status(200).json({ success: false, error: { message: 'Asana unavailable' } });
      return;
    }

    const workspace = (req.query.workspace as string)?.trim() || getDefaultWorkspace();
    const projectGid = (req.query.project as string)?.trim();
    const daysAhead = Math.min(365, Math.max(1, parseInt(String(req.query.daysAhead), 10) || DEFAULT_DAYS_AHEAD));
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setDate(end.getDate() + daysAhead);
    const endDate = end.toISOString().slice(0, 10);

    const result: ProjectWithTasks[] = [];

    if (workspace) {
      const projects = await fetchAllProjects(token, workspace);
      for (const proj of projects) {
        const tasks = await fetchTasksForProject(token, proj.gid, today, endDate);
        tasks.sort((a, b) => {
          const aDate = a.start_date || a.due_on || '9999-12-31';
          const bDate = b.start_date || b.due_on || '9999-12-31';
          return aDate.localeCompare(bDate);
        });
        if (tasks.length > 0) result.push({ projectGid: proj.gid, projectName: proj.name, tasks });
      }
    } else {
      const pid = projectGid || getDealPipelineProjectGid();
      const proj = await fetchProject(token, pid);
      if (!proj) {
        res.json({ success: true, data: [] });
        return;
      }
      const tasks = await fetchTasksForProject(token, proj.gid, today, endDate);
      tasks.sort((a, b) => {
        const aDate = a.start_date || a.due_on || '9999-12-31';
        const bDate = b.start_date || b.due_on || '9999-12-31';
        return aDate.localeCompare(bDate);
      });
      result.push({ projectGid: proj.gid, projectName: proj.name, tasks });
    }

    res.json({ success: true, data: result });
  } catch (e) {
    console.error('[Asana] getUpcomingTasks failed:', e instanceof Error ? e.message : e);
    res.status(200).json({ success: false, error: { message: 'Asana unavailable' } });
  }
}

/** YYYY-MM-DD format. */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PUT /api/asana/tasks/:taskGid/due-on
 * Body: { due_on: "YYYY-MM-DD" } (value is used for Start Date custom field only; Due Date is not changed).
 * Admin remedy: updates the Asana task's custom field "Start Date" only. Due Date (due_on) is never updated.
 * Requires ASANA_START_DATE_CUSTOM_FIELD_GID to be set; otherwise returns 503 with instructions.
 */
export async function updateTaskDueOn(req: Request, res: Response): Promise<void> {
  try {
    const taskGid = (req.params.taskGid || '').trim();
    const dateStr = typeof req.body?.due_on === 'string' ? req.body.due_on.trim() : '';

    if (!taskGid) {
      res.status(400).json({ success: false, error: { message: 'taskGid required' } });
      return;
    }
    if (!DATE_REGEX.test(dateStr)) {
      res.status(400).json({ success: false, error: { message: 'due_on must be YYYY-MM-DD' } });
      return;
    }

    const token = await getAsanaToken();
    if (!token) {
      res.status(200).json({ success: false, error: { message: 'Asana unavailable' } });
      return;
    }

    const startDateFieldGid = process.env.ASANA_START_DATE_CUSTOM_FIELD_GID?.replace(/['"]/g, '').trim();
    if (!startDateFieldGid) {
      res.status(503).json({
        success: false,
        error: {
          message: 'Start Date custom field not configured. Set ASANA_START_DATE_CUSTOM_FIELD_GID so the remedy updates Start Date only (not Due Date).',
        },
      });
      return;
    }

    // Asana date-type custom fields require { date: "YYYY-MM-DD" }, not a plain string.
    const body = { custom_fields: { [startDateFieldGid]: { date: dateStr } } };

    const json = await asanaPut(token, `/tasks/${taskGid}`, body);
    res.json({
      success: true,
      data: json.data || { gid: taskGid, start_date: dateStr },
    });
  } catch (e) {
    console.error('[Asana] updateTaskDueOn failed:', e instanceof Error ? e.message : e);
    res.status(200).json({
      success: false,
      error: { message: e instanceof Error ? e.message : 'Asana unavailable' },
    });
  }
}
