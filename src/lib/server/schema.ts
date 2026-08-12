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
 * A subscribed .ics calendar.
 *
 * In PERSONAL_TABLES: `url` is a bearer credential (Google's "secret address in
 * iCal format" *is* the authentication), so handing it to the workspace owner
 * when a member leaves would hand over read access to their calendar.
 */
export const calendarFeeds = sqliteTable(
  'calendar_feeds',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    label: text('label'),
    enabled: integer('enabled').notNull().default(1),
    /** JSON array of the subscriber's own addresses; excluded from matching. */
    selfEmails: text('self_emails'),
    /** 'known' links only existing people; 'all' creates them. */
    matchMode: text('match_mode').notNull().default('known'),
    windowPastDays: integer('window_past_days').notNull().default(90),
    windowFutureDays: integer('window_future_days').notNull().default(0),
    etag: text('etag'),
    lastModified: text('last_modified'),
    lastFetchedAt: integer('last_fetched_at'),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
    lastEventCount: integer('last_event_count'),
    lastSkippedRecurring: integer('last_skipped_recurring'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_calendar_feeds_ws').on(t.workspaceId, t.enabled),
    index('idx_calendar_feeds_due').on(t.enabled, t.lastFetchedAt)
  ]
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
    /**
     * Sellable hours a week, in minutes. NULL falls back to
     * DEFAULT_WEEKLY_CAPACITY_MINUTES.
     *
     * On the membership rather than the user: someone can be three days a week
     * in one workspace and two in another.
     */
    weeklyCapacityMinutes: integer('weekly_capacity_minutes'),
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
    /**
     * Where this interaction came from, when a human did not type it. `'ics'`
     * today. NULL for anything created in the app — and SQLite treats NULLs as
     * distinct in a unique index, which is what lets uq_interactions_ws_external
     * be non-partial.
     */
    externalSource: text('external_source'),
    /** sha1(UID + NUL + RECURRENCE-ID) for .ics. Stable across re-syncs. */
    externalId: text('external_id'),
    /**
     * Which outreach template produced this message, when one did. Provenance
     * only — there are no template statistics. SET NULL on delete: removing a
     * template must not remove the record of what you wrote to someone.
     */
    outreachTemplateId: text('outreach_template_id'),
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
    /** One of PROJECT_TYPES. Nullable: existing rows predate the column. */
    projectType: text('project_type'),
    startDate: integer('start_date'),
    endDate: integer('end_date'),
    billingType: text('billing_type').notNull().default('none'),
    hourlyRate: integer('hourly_rate'),
    fixedFee: integer('fixed_fee'),
    /** Cents. Only meaningful when billingType === 'retainer'. */
    monthlyFee: integer('monthly_fee'),
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
    /** One of LINK_KINDS. Nullable — an unclassified link groups under 'other'. */
    kind: text('kind'),
    position: integer('position'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_project_links_project').on(t.projectId)]
);

/**
 * Dated checkpoints on a project — the plan, as opposed to the chores.
 *
 * No `workspace_id`: reached through the parent project, exactly like
 * `pipeline_stages`. Tenancy comes from `projectExists(s, projectId)` in
 * saveProject.ts, which every write in `project-plan.ts` calls first.
 */
export const projectMilestones = sqliteTable(
  'project_milestones',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueAt: integer('due_at'),
    completedAt: integer('completed_at'),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('idx_project_milestones_project').on(t.projectId, t.position)]
);

/**
 * Who is booked on a project, for how long, at how many hours a week.
 *
 * The spine of /availability. Time-boxed rather than a single number on the
 * membership, because a ramp-down ("24h/wk in Q1, 8h/wk in Q2") is the normal
 * case and cannot be expressed otherwise.
 *
 * **Two user columns, and the difference is load-bearing.** `userId` is
 * ordinary created-by attribution, so the generic `reassignAuthorship` loop
 * handles it unchanged. `assigneeUserId` is a real reference to whose time is
 * booked — it is genuinely filtered on, and when that member leaves the
 * allocation is *deleted*, not handed to the owner (see ASSIGNMENT_COLUMNS in
 * migrate.ts). Leaving it would book a workspace against someone who is gone.
 *
 * Hours are stored as integer minutes, like money is stored as cents. No
 * floats: "7.5 hours" is 450 and always adds up.
 */
export const projectAllocations = sqliteTable(
  'project_allocations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Created-by attribution only — never a filter. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Whose time this books. A real owner, filtered on. */
    assigneeUserId: text('assignee_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    startDate: integer('start_date').notNull(),
    endDate: integer('end_date').notNull(),
    minutesPerWeek: integer('minutes_per_week').notNull(),
    /**
     * Which weekdays this falls on, as a bitmask (Mon = bit 0 … Sun = bit 6).
     *
     * NULL means unspecified — the hours spread across the week, which is how
     * every allocation behaved before patterns existed. When set, the weekly
     * hours divide across the chosen days: 16h/wk on Tue+Thu is 8h each.
     */
    dayMask: integer('day_mask'),
    /** Overrides the project's hourly rate for this person. Cents. */
    hourlyRate: integer('hourly_rate'),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_alloc_ws_range').on(t.workspaceId, t.startDate, t.endDate),
    index('idx_alloc_ws_assignee').on(t.workspaceId, t.assigneeUserId, t.startDate),
    index('idx_alloc_project').on(t.projectId)
  ]
);

/**
 * Tracked time. One row per stretch of work.
 *
 * **`ended_at IS NULL` means the timer is running.** There is no separate
 * "current timer" table or column — the running entry *is* an entry that has
 * not stopped, so starting on a laptop and stopping on a phone needs no
 * synchronisation beyond the row itself. `uq_time_entries_running` (a partial
 * unique index, see WORKSPACE_UNIQUES) is what enforces one per person.
 *
 * **No duration column.** A manual entry writes both timestamps and duration is
 * always derived, so the two representations cannot drift.
 *
 * `hourly_rate` and `currency` are **snapshots**, resolved allocation → project
 * when the entry is created or stopped. Re-deriving them at report time would
 * mean raising a project's rate silently rewrites what you already invoiced.
 *
 * `project_id` is SET NULL, not CASCADE: deleting a project must not erase the
 * record of hours billed against it. Same reasoning as
 * `interactions.outreach_template_id`.
 */
export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Whose time this is. A real owner, not attribution — reads filter on it. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Optional: a timer can start unassigned and be filed later. */
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    milestoneId: text('milestone_id').references(() => projectMilestones.id, {
      onDelete: 'set null'
    }),
    description: text('description'),
    startedAt: integer('started_at').notNull(),
    /** NULL means running. */
    endedAt: integer('ended_at'),
    billable: integer('billable').notNull().default(0),
    hourlyRate: integer('hourly_rate'),
    currency: text('currency'),
    /** Reserved: the seam for an invoicing pass. Nothing writes it yet. */
    invoicedAt: integer('invoiced_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_time_ws_started').on(t.workspaceId, t.startedAt),
    index('idx_time_ws_user_started').on(t.workspaceId, t.userId, t.startedAt),
    index('idx_time_ws_project').on(t.workspaceId, t.projectId)
  ]
);

/**
 * Measurable targets on a project — "ship 12 posts", 7 done.
 *
 * Kept separate from milestones rather than folded in as nullable columns:
 * "deliver the design system by 1 March" and "ship 12 posts" are different
 * questions and read badly interleaved in one list.
 */
export const projectGoals = sqliteTable(
  'project_goals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Free-text unit label ('posts', 'hours', '%'). Display only. */
    unit: text('unit'),
    targetValue: integer('target_value').notNull(),
    currentValue: integer('current_value').notNull().default(0),
    dueAt: integer('due_at'),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [index('idx_project_goals_project').on(t.projectId, t.position)]
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

/**
 * Outreach message templates.
 *
 * Workspace-owned, so `user_id` is created-by attribution — *except* on rows
 * with `visibility = 'private'`, where it is a real owner. That is why the
 * table is in TENANT_TABLES but also in ROW_PERSONAL (migrate.ts): a departing
 * member's shared templates pass to the workspace owner, their private ones are
 * deleted.
 */
export const outreachTemplates = sqliteTable(
  'outreach_templates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    /** Email and InMail only; null for every other platform. */
    subject: text('subject'),
    body: text('body').notNull(),
    visibility: text('visibility').notNull().default('shared'),
    /** Days until the follow-up reminder, or null for no nudge. */
    nudgeDays: integer('nudge_days'),
    isArchived: integer('is_archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_outreach_ws_arch').on(t.workspaceId, t.isArchived),
    index('idx_outreach_ws_platform').on(t.workspaceId, t.platform, t.isArchived),
    index('idx_outreach_ws_user').on(t.workspaceId, t.userId),
    index('idx_outreach_ws_updated').on(t.workspaceId, t.updatedAt)
  ]
);

/**
 * Which templates a stage offers, in order.
 *
 * No `workspace_id` — `pipeline_stages` has none either. Scope reaches this
 * table by joining through `pipelines`, which every query in `outreach.ts`
 * does.
 */
export const pipelineStageTemplates = sqliteTable(
  'pipeline_stage_templates',
  {
    stageId: text('stage_id')
      .notNull()
      .references(() => pipelineStages.id, { onDelete: 'cascade' }),
    templateId: text('template_id')
      .notNull()
      .references(() => outreachTemplates.id, { onDelete: 'cascade' }),
    position: integer('position').notNull()
  },
  (t) => [
    primaryKey({ columns: [t.stageId, t.templateId] }),
    index('idx_pst_stage_pos').on(t.stageId, t.position),
    index('idx_pst_template').on(t.templateId)
  ]
);

export const OUTREACH_VISIBILITIES = ['shared', 'private'] as const;
export type OutreachVisibility = (typeof OUTREACH_VISIBILITIES)[number];

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
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type ProjectGoal = typeof projectGoals.$inferSelect;
export type ProjectAllocation = typeof projectAllocations.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;

// Lives in `$lib/duration` so the browser can read it without pulling Drizzle
// in. Re-exported here for server callers.
export { DEFAULT_WEEKLY_CAPACITY_MINUTES } from '$lib/duration';
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

// Project type, billing shape and link kinds live in `$lib/projectTypes` so the
// browser can import them without pulling Drizzle in. Re-exported here so every
// existing `from './schema'` import keeps resolving.
export {
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  isProjectType,
  BILLING_TYPES,
  BILLING_TYPE_LABELS,
  isBillingType,
  BILLING_MONEY_FIELD,
  LINK_KINDS,
  LINK_KIND_LABELS,
  isLinkKind,
  linkKindOf
} from '$lib/projectTypes';
export type { ProjectType, BillingType, LinkKind } from '$lib/projectTypes';

export const MEMBER_KINDS = ['person', 'company'] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];

export const STAGE_KINDS = ['open', 'won', 'lost'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const PIPELINE_VIEWS = ['kanban', 'list'] as const;
export type PipelineView = (typeof PIPELINE_VIEWS)[number];
