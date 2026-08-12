import { request } from './client';
import type { PersonRow, InteractionRow } from '../db/cache';

/**
 * Every `/api/v1` endpoint this app can reach, in one place.
 *
 * The point is not convenience — the screens could call `request` directly.
 * It is that `scripts/check-parity.ts` reads this file and the route tree under
 * `src/routes/api/v1/` and fails `npm run check` when they disagree. Adding an
 * endpoint to the server without deciding what the app does about it is
 * exactly how two clients of one API drift apart over a year, and the decision
 * is cheap to record and expensive to reconstruct.
 *
 * "Deciding" includes deciding *not* to: an endpoint the app deliberately does
 * not use goes in the lint's ALLOW list with a reason, not here.
 */

type Paged<T> = { data: T[]; nextCursor: string | null };

export const api = {
  /* identity */
  me: () =>
    request<{
      user: { id: string; email: string | null; username: string | null };
      workspace: { id: string; name: string | null; region: string };
      role: string;
      workspaces: { id: string; name: string; role: string }[];
      credential: 'session' | 'pat' | 'device';
    }>('/me'),

  /* devices — the app may only manage itself */
  registerPush: (pushToken: string | null) =>
    request<{ pushEnabled: boolean }>('/devices/self', {
      method: 'PATCH',
      body: { pushToken }
    }),
  unpairSelf: () => request<{ revoked: boolean }>('/devices/self', { method: 'DELETE' }),

  /* people */
  people: (query: { q?: string; cursor?: string; limit?: number } = {}) =>
    request<Paged<PersonRow>>('/people', { query }),
  person: (id: string) => request<PersonRow>(`/people/${id}`),
  createPerson: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<PersonRow>('/people', { method: 'POST', body, idempotencyKey }),
  updatePerson: (id: string, body: Record<string, unknown>) =>
    request<PersonRow>(`/people/${id}`, { method: 'PATCH', body }),
  deletePerson: (id: string) =>
    request<{ id: string; deleted: true }>(`/people/${id}`, { method: 'DELETE' }),

  /* companies */
  companies: (query: { q?: string; cursor?: string; limit?: number } = {}) =>
    request<Paged<Record<string, unknown>>>('/companies', { query }),
  company: (id: string) => request<Record<string, unknown>>(`/companies/${id}`),
  createCompany: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<Record<string, unknown>>('/companies', { method: 'POST', body, idempotencyKey }),
  updateCompany: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/companies/${id}`, { method: 'PATCH', body }),
  deleteCompany: (id: string) =>
    request<{ id: string; deleted: true }>(`/companies/${id}`, { method: 'DELETE' }),

  /* interactions */
  interactions: (query: Record<string, string | number | undefined> = {}) =>
    request<InteractionRow[]>('/interactions', { query }),
  interaction: (id: string) => request<InteractionRow>(`/interactions/${id}`),
  createInteraction: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<InteractionRow>('/interactions', { method: 'POST', body, idempotencyKey }),
  updateInteraction: (id: string, body: Record<string, unknown>) =>
    request<InteractionRow>(`/interactions/${id}`, { method: 'PATCH', body }),
  deleteInteraction: (id: string) =>
    request<{ id: string; deleted: true }>(`/interactions/${id}`, { method: 'DELETE' }),
  attachPerson: (interactionId: string, personId: string) =>
    request<InteractionRow>(`/interactions/${interactionId}/people`, {
      method: 'POST',
      body: { personId }
    }),
  detachPerson: (interactionId: string, personId: string) =>
    request<InteractionRow>(`/interactions/${interactionId}/people`, {
      method: 'DELETE',
      body: { personId }
    }),

  /* reminders — personal */
  reminders: () => request<Record<string, unknown>[]>('/reminders'),
  createReminder: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<Record<string, unknown>>('/reminders', { method: 'POST', body, idempotencyKey }),
  deleteReminder: (id: string) =>
    request<{ id: string; deleted: true }>(`/reminders/${id}`, { method: 'DELETE' }),

  /* tasks — shared */
  tasks: (kind: 'person' | 'company', refId: string) =>
    request<Record<string, unknown>[]>('/tasks', { query: { kind, refId } }),
  createTask: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<Record<string, unknown>>('/tasks', { method: 'POST', body, idempotencyKey }),
  updateTask: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/tasks/${id}`, { method: 'PATCH', body }),
  deleteTask: (id: string) =>
    request<{ id: string; deleted: true }>(`/tasks/${id}`, { method: 'DELETE' }),

  /* vocabulary */
  tags: (scope: 'person' | 'company') =>
    request<Record<string, unknown>[]>('/tags', { query: { scope } }),
  attachTag: (body: Record<string, unknown>) =>
    request<Record<string, unknown>[]>('/tags', { method: 'POST', body }),
  detachTag: (query: { scope: string; entityId: string; tagId: string }) =>
    request<Record<string, unknown>[]>('/tags', { method: 'DELETE', query }),
  deleteTag: (id: string) =>
    request<{ id: string; deleted: true }>(`/tags/${id}`, { method: 'DELETE' }),
  statuses: (scope: 'person' | 'company') =>
    request<Record<string, unknown>[]>('/statuses', { query: { scope } }),
  createStatus: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/statuses', { method: 'POST', body }),
  deleteStatus: (query: { scope: string; id: string }) =>
    request<{ id: string; deleted: true }>('/statuses', { method: 'DELETE', query }),

  /* time */
  time: (query: Record<string, string | number | undefined> = {}) =>
    request<{ items: Record<string, unknown>[]; running: Record<string, unknown> | null }>(
      '/time',
      { query }
    ),
  createTimeEntry: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string }>('/time', { method: 'POST', body, idempotencyKey }),
  updateTimeEntry: (id: string, body: Record<string, unknown>) =>
    request<{ id: string; updated: true }>(`/time/${id}`, { method: 'PATCH', body }),
  deleteTimeEntry: (id: string) =>
    request<{ id: string; deleted: true }>(`/time/${id}`, { method: 'DELETE' }),
  startTimer: (body: Record<string, unknown> = {}) =>
    request<{ entry: Record<string, unknown>; alreadyRunning: boolean }>('/time/start', {
      method: 'POST',
      body
    }),
  stopTimer: () =>
    request<Record<string, unknown> | null>('/time/stop', { method: 'POST' }),

  /* planning */
  projects: (query: Record<string, string | number | undefined> = {}) =>
    request<{ items: Record<string, unknown>[]; total: number }>('/projects', { query }),
  project: (id: string, include?: string) =>
    request<Record<string, unknown>>(`/projects/${id}`, { query: { include } }),
  createProject: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string }>('/projects', { method: 'POST', body, idempotencyKey }),
  updateProject: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/projects/${id}`, { method: 'PATCH', body }),
  deleteProject: (id: string) =>
    request<{ id: string; deleted: true }>(`/projects/${id}`, { method: 'DELETE' }),
  capacity: (query: { weeks?: number; from?: number } = {}) =>
    request<Record<string, unknown>>('/capacity', { query }),

  /* organise */
  collections: (query: Record<string, string | number | undefined> = {}) =>
    request<Record<string, unknown>[]>('/collections', { query }),
  collection: (id: string) => request<Record<string, unknown>>(`/collections/${id}`),
  createCollection: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string }>('/collections', { method: 'POST', body, idempotencyKey }),
  updateCollection: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/collections/${id}`, { method: 'PATCH', body }),
  deleteCollection: (id: string) =>
    request<{ id: string; deleted: true }>(`/collections/${id}`, { method: 'DELETE' }),
  addToCollection: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/collections/${id}/items`, { method: 'POST', body }),
  removeFromCollection: (id: string, query: { kind: string; refId: string }) =>
    request<Record<string, unknown>>(`/collections/${id}/items`, { method: 'DELETE', query }),

  pipelines: (query: Record<string, string | number | undefined> = {}) =>
    request<Record<string, unknown>[]>('/pipelines', { query }),
  pipeline: (id: string) => request<Record<string, unknown>>(`/pipelines/${id}`),
  createPipeline: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string }>('/pipelines', { method: 'POST', body, idempotencyKey }),
  updatePipeline: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/pipelines/${id}`, { method: 'PATCH', body }),
  deletePipeline: (id: string) =>
    request<{ id: string; deleted: true }>(`/pipelines/${id}`, { method: 'DELETE' }),
  pipelineItems: (id: string) => request<Record<string, unknown>[]>(`/pipelines/${id}/items`),
  addPipelineItem: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/pipelines/${id}/items`, { method: 'POST', body }),
  movePipelineItem: (id: string, itemId: string, toStageId: string) =>
    request<Record<string, unknown>>(`/pipelines/${id}/items/${itemId}/move`, {
      method: 'POST',
      body: { toStageId }
    }),

  /* engage */
  outreach: (query: Record<string, string | number | undefined> = {}) =>
    request<Record<string, unknown>[]>('/outreach', { query }),
  template: (id: string) => request<Record<string, unknown>>(`/outreach/${id}`),
  createTemplate: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string }>('/outreach', { method: 'POST', body, idempotencyKey }),
  updateTemplate: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/outreach/${id}`, { method: 'PATCH', body }),
  deleteTemplate: (id: string) =>
    request<{ id: string; deleted: true }>(`/outreach/${id}`, { method: 'DELETE' }),
  markSent: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<{ id: string; reminderId: string | null }>('/outreach/sent', {
      method: 'POST',
      body,
      idempotencyKey
    }),

  /* search and capture */
  search: (q: string, perKind = 5) =>
    request<Record<string, unknown>>('/search', { query: { q, perKind } }),
  lookup: (url: string) => request<Record<string, unknown>>('/lookup', { query: { url } }),
  capture: (body: Record<string, unknown>, idempotencyKey?: string) =>
    request<Record<string, unknown>>('/capture', { method: 'POST', body, idempotencyKey }),

  /* workspace and account */
  members: () => request<Record<string, unknown>[]>('/workspace/members'),
  capacities: () => request<Record<string, unknown>[]>('/workspace/capacity'),
  setCapacity: (body: Record<string, unknown>) =>
    request<Record<string, unknown>[]>('/workspace/capacity', { method: 'PATCH', body }),
  calendars: () => request<Record<string, unknown>[]>('/calendar'),
  deleteAccount: (body: Record<string, unknown>) =>
    request<{ deleted: true }>('/account', { method: 'DELETE', body })
};
