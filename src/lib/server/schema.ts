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

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
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
    location: text('location'),
    notes: text('notes'),
    isFavorite: integer('is_favorite').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
    source: text('source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_companies_user_arch').on(t.userId, t.isArchived),
    index('idx_companies_user_fav').on(t.userId, t.isFavorite),
    index('idx_companies_user_domain').on(t.userId, t.domain),
    uniqueIndex('uq_companies_user_url').on(t.userId, t.url)
  ]
);

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
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
    suggestedCompanyName: text('suggested_company_name'),
    suggestedCompanyUrl: text('suggested_company_url'),
    isFavorite: integer('is_favorite').notNull().default(0),
    isArchived: integer('is_archived').notNull().default(0),
    source: text('source'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_people_user_arch').on(t.userId, t.isArchived),
    index('idx_people_user_fav').on(t.userId, t.isFavorite),
    index('idx_people_user_company').on(t.userId, t.companyId),
    index('idx_people_user_domain').on(t.userId, t.domain),
    uniqueIndex('uq_people_user_url').on(t.userId, t.url)
  ]
);

export const interactions = sqliteTable(
  'interactions',
  {
    id: text('id').primaryKey(),
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
    index('idx_interactions_user_occurred').on(t.userId, t.occurredAt),
    index('idx_interactions_user_company').on(t.userId, t.companyId)
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
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    scope: text('scope').notNull()
  },
  (t) => [uniqueIndex('uq_tags_user_slug_scope').on(t.userId, t.slug, t.scope)]
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

export const interactionTags = sqliteTable(
  'interaction_tags',
  {
    interactionId: text('interaction_id')
      .notNull()
      .references(() => interactions.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.interactionId, t.tagId] })]
);

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    refId: text('ref_id').notNull(),
    remindAt: integer('remind_at').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_reminders_user_at').on(t.userId, t.remindAt)]
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
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
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [
    index('idx_projects_user_status').on(t.userId, t.status),
    index('idx_projects_user_end').on(t.userId, t.endDate),
    index('idx_projects_user_updated').on(t.userId, t.updatedAt)
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

export const projectTags = sqliteTable(
  'project_tags',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.projectId, t.tagId] })]
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectLink = typeof projectLinks.$inferSelect;

export const TAG_SCOPES = ['person', 'company', 'interaction', 'project'] as const;
export type TagScope = (typeof TAG_SCOPES)[number];
export const REMINDER_KINDS = ['person', 'company', 'interaction', 'project'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const BILLING_TYPES = ['none', 'hourly', 'fixed'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];
