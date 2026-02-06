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
    const tokenUrl = ASANA_API_BASE.replace(/\/api\/1\.0\/?$/, '') + '/api/1.0/oauth_token';
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
  } catch {
    oauthTokenCache = null;
    return null;
  }
}

function getDealPipelineProjectGid(): string {
  return process.env.ASANA_PROJECT_GID?.replace(/['"]/g, '').trim() || DEFAULT_DEAL_PIPELINE_PROJECT_GID;
}

interface AsanaProject {
  gid: string;
  name: string;
}

interface AsanaTaskRaw {
  gid: string;
  name: string;
  due_on: string | null;
  permalink_url?: string;
}

interface UpcomingTask {
  gid: string;
  name: string;
  due_on: string;
  permalink_url: string;
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
      opt_fields: 'name,due_on,permalink_url,gid',
      limit: '100',
      completed_since: 'now',
    };
    if (offset) params.offset = offset;

    const path = `/projects/${projectGid}/tasks?${new URLSearchParams(params)}`;
    const json = await asanaFetch(token, path);
    const batch = (json.data || []) as AsanaTaskRaw[];

    for (const t of batch) {
      if (!t.due_on) continue;
      if (t.due_on < today || t.due_on > endDate) continue;
      tasks.push({
        gid: t.gid,
        name: t.name,
        due_on: t.due_on,
        permalink_url: t.permalink_url || `https://app.asana.com/0/0/${t.gid}`,
      });
    }
    offset = json.next_page?.offset ?? null;
  } while (offset);

  return tasks;
}

/**
 * GET /api/asana/upcoming-tasks
 * Uses the Deal Pipeline project only (ASANA_PROJECT_GID). Query: project (optional override), daysAhead (optional, default 90).
 * Returns Asana tasks with due dates in the next N days from the Deal Pipeline project.
 */
export async function getUpcomingTasks(req: Request, res: Response): Promise<void> {
  try {
    const token = await getAsanaToken();
    if (!token) {
      res.status(200).json({ success: false, error: { message: 'Asana unavailable' } });
      return;
    }

    const projectGid = (req.query.project as string) || getDealPipelineProjectGid();
    const daysAhead = Math.min(365, Math.max(1, parseInt(String(req.query.daysAhead), 10) || DEFAULT_DAYS_AHEAD));
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date();
    end.setDate(end.getDate() + daysAhead);
    const endDate = end.toISOString().slice(0, 10);

    const proj = await fetchProject(token, projectGid);
    if (!proj) {
      res.json({ success: true, data: [] });
      return;
    }

    const tasks = await fetchTasksForProject(token, proj.gid, today, endDate);
    tasks.sort((a, b) => a.due_on.localeCompare(b.due_on));

    const result: ProjectWithTasks[] = [
      { projectGid: proj.gid, projectName: proj.name, tasks },
    ];

    res.json({ success: true, data: result });
  } catch {
    res.status(200).json({ success: false, error: { message: 'Asana unavailable' } });
  }
}
