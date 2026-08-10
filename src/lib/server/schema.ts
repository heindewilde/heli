import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  username: text('username'),
  createdAt: integer('created_at').notNull()
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Which workspace this device is currently looking at. Nullable: a session
    // can outlive the workspace it pointed at (removed member, deleted
    // workspace), in which case validateSession falls back to another membership.
    activeWorkspaceId: text('active_workspace_id'),
    expiresAt: integer('expires_at').notNull()
  },
  (t) => [index('idx_sessions_user').on(t.userId)]
);

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  token: text('token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at')
});

export const emailRouting = sqliteTable('email_routing', {
  email: text('email').primaryKey(),
  region: text('region').notNull()
});

// Tenancy. A workspace owns every CRM entity; `user_id` on those tables is kept
// purely as created-by attribution. A workspace is pinned to exactly one region
// because its rows live in that region's libSQL database — see `db(region)` —
// so every member must resolve to the same region.
export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    region: text('region').notNull(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    plan: text('plan').notNull().default('free'),
    // NULL means unlimited — the self-host default. Cloud provisioning sets a number.
    seatLimit: integer('seat_limit'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('idx_workspaces_owner').on(t.ownerUserId)]
);

/**
 * Personal access tokens for /api/v1.
 *
 * Hashed with SHA-256, not bcrypt: the secret is 32 bytes of CSPRNG output, so
 * there is no low-entropy password to slow an attacker down — and bcrypt at the
 * cost factor auth.ts uses would add ~80 ms to every single API request.
 *
 * In PERSONAL_TABLES: a token authenticates as its owner, so removing a member
 * must delete it, never reassign it.
 */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Display-only leading segment, e.g. `heli_eu_a1b2c3`. Never the secret. */
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    /** Comma-separated TokenScope list. */
    scopes: text('scopes').notNull(),
    lastUsedAt: integer('last_used_at'),
    expiresAt: integer('expires_at'),
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    uniqueIndex('uq_api_tokens_hash').on(t.tokenHash),
    index('idx_api_tokens_ws').on(t.workspaceId, t.createdAt),
    index('idx_api_tokens_user').on(t.userId)
  ]
);

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('idx_workspace_members_user').on(t.userId)
  ]
);

export const workspaceInvites = sqliteTable(
  'workspace_invites',
  {
    token: text('token').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    acceptedAt: integer('accepted_at'),
    // Revoked rather than deleted, so a re-invite after revoke is possible
    // without tripping the pending-invite unique index (declared in migrate.ts —
    // it is partial, which Drizzle's schema DSL can't express).
    revokedAt: integer('revoked_at'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    index('idx_workspace_invites_ws').on(t.workspaceId, t.createdAt),
    index('idx_workspace_invites_email').on(t.email)
  ]
);

// The version tracking this migrator otherwise lacks. Used to gate one-shot
// backfills so they don't re-scan every table on each boot.
export const schemaMeta = sqliteTable('schema_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Created-by attribution, not tenancy. Reassigned to the workspace owner
    // when a member leaves so their records survive.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url'),
    domain: text('domain'),
    description: text('description'),
    logoUrl: text('logo_url'),
    faviconUrl: text('favicon_url'),
    industry: text('industry'),
    sizeBand: text('size_band'),
    location: text('location'),
    notes: text('notes'),
    linkedinUrl: text('linkedin_url'),
    xUrl: text('x_url'),
    priority: integer('priority'),
    statusId: text('status_id').references(() => companyStatuses.id, { onDelete: 'set null' }),
    isFavorite: integer('is_favorite').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
    source: text('source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_companies_ws_arch').on(t.workspaceId, t.isArchived),
    index('idx_companies_ws_fav').on(t.workspaceId, t.isFavorite),
    index('idx_companies_ws_domain').on(t.workspaceId, t.domain),
    index('idx_companies_ws_priority').on(t.workspaceId, t.priority),
    index('idx_companies_ws_status').on(t.workspaceId, t.statusId),
    uniqueIndex('uq_companies_ws_url').on(t.workspaceId, t.url)
  ]
);

export const companyStatuses = sqliteTable(
  'company_statuses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tone: text('tone').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    index('idx_company_statuses_ws_sort').on(t.workspaceId, t.sortOrder),
    uniqueIndex('uq_company_statuses_ws_name').on(t.workspaceId, t.name)
  ]
);

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url'),
    domain: text('domain'),
    handle: text('handle'),
    role: text('role'),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    email: text('email'),
    phone: text('phone'),
    location: text('location'),
    avatarUrl: text('avatar_url'),
    faviconUrl: text('favicon_url'),
    notes: text('notes'),
    linkedinUrl: text('linkedin_url'),
    xUrl: text('x_url'),
    suggestedCompanyName: text('suggested_company_name'),
    suggestedCompanyUrl: text('suggested_company_url'),
    priority: integer('priority'),
    statusId: text('status_id').references(() => peopleStatuses.id, { onDelete: 'set null' }),
    isFavorite: integer('is_favorite').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
    source: text('source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_people_ws_arch').on(t.workspaceId, t.isArchived),
    index('idx_people_ws_fav').on(t.workspaceId, t.isFavorite),
    index('idx_people_ws_company').on(t.workspaceId, t.companyId),
    index('idx_people_ws_domain').on(t.workspaceId, t.domain),
    index('idx_people_ws_priority').on(t.workspaceId, t.priority),
    index('idx_people_ws_status').on(t.workspaceId, t.statusId),
    uniqueIndex('uq_people_ws_url').on(t.workspaceId, t.url)
  ]
);

export const peopleStatuses = sqliteTable(
  'people_statuses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tone: text('tone').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    index('idx_people_statuses_ws_sort').on(t.workspaceId, t.sortOrder),
    uniqueIndex('uq_people_statuses_ws_name').on(t.workspaceId, t.name)
  ]
);

export const interactions = sqliteTable(
  'interactions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    occurredAt: integer('occurred_at').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_interactions_ws_occurred').on(t.workspaceId, t.occurredAt),
    index('idx_interactions_ws_company').on(t.workspaceId, t.companyId)
  ]
);

export const interactionPeople = sqliteTable(
  'interaction_people',
  {
    interactionId: text('interaction_id')
      .notNull()
      .references(() => interactions.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' })
  },
  (t) => [
    primaryKey({ columns: [t.interactionId, t.personId] }),
    index('idx_ip_person').on(t.personId)
  ]
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    scope: text('scope').notNull()
  },
  (t) => [uniqueIndex('uq_tags_ws_slug_scope').on(t.workspaceId, t.slug, t.scope)]
);

export const personTags = sqliteTable(
  'person_tags',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.personId, t.tagId] })]
);

export const companyTags = sqliteTable(
  'company_tags',
  {
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.companyId, t.tagId] })]
);

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    remindAt: integer('remind_at').notNull(),
    createdAt: integer('created_at').notNull()
  },
  // Reminders are PERSONAL: "remind me about this person". `workspace_id` exists
  // for the tenancy invariant and the cascade, but reads must filter on
  // (workspace_id, user_id) — scoping by workspace alone would put every
  // member's reminders in everyone else's sidebar. Hence user_id in the index.
  (t) => [index('idx_reminders_ws_user_at').on(t.workspaceId, t.userId, t.remindAt)]
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    title: text('title').notNull(),
    dueAt: integer('due_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_tasks_ws_ref').on(t.workspaceId, t.kind, t.refId, t.completedAt),
    index('idx_tasks_ws_due').on(t.workspaceId, t.dueAt)
  ]
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    startDate: integer('start_date'),
    endDate: integer('end_date'),
    billingType: text('billing_type').notNull().default('none'),
    hourlyRate: integer('hourly_rate'),
    fixedFee: integer('fixed_fee'),
    currency: text('currency'),
    nextStep: text('next_step'),
    icon: text('icon'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_projects_ws_status').on(t.workspaceId, t.status),
    index('idx_projects_ws_end').on(t.workspaceId, t.endDate),
    index('idx_projects_ws_updated').on(t.workspaceId, t.updatedAt)
  ]
);

export const projectLinks = sqliteTable(
  'project_links',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    label: text('label'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_project_links_project').on(t.projectId)]
);

export const projectPeople = sqliteTable(
  'project_people',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' })
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.personId] }),
    index('idx_pp_person').on(t.personId)
  ]
);

export const projectCompanies = sqliteTable(
  'project_companies',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    companyId: text('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' })
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.companyId] }),
    index('idx_pc_company').on(t.companyId)
  ]
);

export const interactionProjects = sqliteTable(
  'interaction_projects',
  {
    interactionId: text('interaction_id')
      .notNull()
      .references(() => interactions.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' })
  },
  (t) => [
    primaryKey({ columns: [t.interactionId, t.projectId] }),
    index('idx_ip_project').on(t.projectId)
  ]
);

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    isArchived: integer('is_archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_collections_ws_arch').on(t.workspaceId, t.isArchived),
    index('idx_collections_ws_updated').on(t.workspaceId, t.updatedAt)
  ]
);

export const collectionItems = sqliteTable(
  'collection_items',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    addedAt: integer('added_at').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.kind, t.refId] }),
    index('idx_collection_items_ref').on(t.kind, t.refId)
  ]
);

export const pipelines = sqliteTable(
  'pipelines',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    defaultView: text('default_view').notNull().default('kanban'),
    isArchived: integer('is_archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_pipelines_ws_arch').on(t.workspaceId, t.isArchived),
    index('idx_pipelines_ws_updated').on(t.workspaceId, t.updatedAt)
  ]
);

export const pipelineStages = sqliteTable(
  'pipeline_stages',
  {
    id: text('id').primaryKey(),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('open'),
    color: text('color'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_pipeline_stages_pipeline_pos').on(t.pipelineId, t.position)]
);

export const pipelineItems = sqliteTable(
  'pipeline_items',
  {
    id: text('id').primaryKey(),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    stageId: text('stage_id')
      .notNull()
      .references(() => pipelineStages.id),
    enteredStageAt: integer('entered_stage_at').notNull(),
    note: text('note'),
    valueCents: integer('value_cents'),
    currency: text('currency'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    uniqueIndex('uq_pipeline_items_pipeline_ref').on(t.pipelineId, t.kind, t.refId),
    index('idx_pipeline_items_ref').on(t.kind, t.refId),
    index('idx_pipeline_items_pipeline_stage').on(t.pipelineId, t.stageId)
  ]
);

export const pipelineItemEvents = sqliteTable(
  'pipeline_item_events',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => pipelineItems.id, { onDelete: 'cascade' }),
    fromStageId: text('from_stage_id'),
    toStageId: text('to_stage_id').notNull(),
    at: integer('at').notNull(),
    byUserId: text('by_user_id').notNull()
  },
  (t) => [index('idx_pipeline_item_events_item_at').on(t.itemId, t.at)]
);

export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [
    uniqueIndex('uq_oauth_accounts_provider').on(t.provider, t.providerUserId),
    index('idx_oauth_accounts_user').on(t.userId)
  ]
);

export const dailyMetrics = sqliteTable(
  'daily_metrics',
  {
    date: text('date').notNull(),
    metric: text('metric').notNull(),
    value: integer('value').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.date, t.metric] }),
    index('idx_daily_metrics_metric_date').on(t.metric, t.date)
  ]
);

export const collectionPipelineSync = sqliteTable(
  'collection_pipeline_syncs',
  {
    collectionId: text('collection_id')
      .primaryKey()
      .references(() => collections.id, { onDelete: 'cascade' }),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_cps_pipeline').on(t.pipelineId)]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectLink = typeof projectLinks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type PipelineItem = typeof pipelineItems.$inferSelect;
export type PipelineItemEvent = typeof pipelineItemEvents.$inferSelect;
export type DailyMetric = typeof dailyMetrics.$inferSelect;

// Ordered most- to least-privileged. `owner` can delete the workspace and
// transfer ownership; `owner`/`admin` can invite and remove members; `member`
// does everything else. Keep permission checks to those cases — don't scatter
// finer-grained rules until there's a reason.
export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const TAG_SCOPES = ['person', 'company'] as const;
export type TagScope = (typeof TAG_SCOPES)[number];
export const REMINDER_KINDS = ['person', 'company', 'interaction', 'project'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const BILLING_TYPES = ['none', 'hourly', 'fixed'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const MEMBER_KINDS = ['person', 'company'] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];

export const STAGE_KINDS = ['open', 'won', 'lost'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const PIPELINE_VIEWS = ['kanban', 'list'] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];
