/**
 * Project fields: type, the billing cross-field rule, link kinds, and the
 * filtered count.
 *
 * The billing rule is the one worth pinning. A project owns exactly one money
 * column, and switching type must blank the others — otherwise a project that
 * was hourly at 200/h and is now a fixed fee still carries the old rate, which
 * `time.ts` would happily bill against in phase 4.
 */
import { beforeAll, afterAll, expect, test, describe } from 'vitest';
import { freshDb, type TestDb } from './helpers/testDb';
import { makeTenant, type Tenant } from './helpers/fixtures';

let ctx: TestDb;
let alice: Tenant;

beforeAll(async () => {
  ctx = await freshDb();
  alice = await makeTenant('alice');
}, 120_000);

afterAll(() => ctx?.cleanup());

async function read(id: string) {
  const { getProject } = await import('../src/lib/server/projects-query');
  const p = await getProject(alice.scope, id);
  if (!p) throw new Error('missing');
  return p;
}

describe('billing', () => {
  test('each billing type keeps only its own money column', async () => {
    const { createProject, updateProject } = await import('../src/lib/server/saveProject');
    const { id } = await createProject(alice.scope, {
      name: 'Acme',
      billingType: 'hourly',
      hourlyRate: 20_000,
      currency: 'EUR'
    });
    expect(await read(id)).toMatchObject({
      billingType: 'hourly',
      hourlyRate: 20_000,
      fixedFee: null,
      monthlyFee: null
    });

    await updateProject(alice.scope, id, { billingType: 'retainer', monthlyFee: 400_000 });
    expect(await read(id)).toMatchObject({
      billingType: 'retainer',
      monthlyFee: 400_000,
      hourlyRate: null,
      fixedFee: null
    });

    await updateProject(alice.scope, id, { billingType: 'fixed', fixedFee: 1_000_000 });
    expect(await read(id)).toMatchObject({
      billingType: 'fixed',
      fixedFee: 1_000_000,
      hourlyRate: null,
      monthlyFee: null
    });

    // 'none' additionally clears the currency — there is no amount to denominate.
    await updateProject(alice.scope, id, { billingType: 'none' });
    expect(await read(id)).toMatchObject({
      billingType: 'none',
      hourlyRate: null,
      fixedFee: null,
      monthlyFee: null,
      currency: null
    });
  });

  test('retainer is an accepted billing type and a bogus one is not', async () => {
    const { createProject } = await import('../src/lib/server/saveProject');
    await expect(
      createProject(alice.scope, {
        name: 'Bad',
        billingType: 'subscription' as never
      })
    ).rejects.toThrow('invalid_billing_type');
  });
});

describe('project type', () => {
  test('is stored, clearable, and validated', async () => {
    const { createProject, updateProject } = await import('../src/lib/server/saveProject');
    const { id } = await createProject(alice.scope, { name: 'Internal tool', projectType: 'internal' });
    expect((await read(id)).projectType).toBe('internal');

    await updateProject(alice.scope, id, { projectType: null });
    expect((await read(id)).projectType).toBeNull();

    await expect(
      updateProject(alice.scope, id, { projectType: 'skunkworks' as never })
    ).rejects.toThrow('invalid_project_type');
  });

  test('countProjects honours the type filter', async () => {
    const { createProject } = await import('../src/lib/server/saveProject');
    const { countProjects, listProjects } = await import('../src/lib/server/projects-query');
    const bob = await makeTenant('bob-count');

    await createProject(bob.scope, { name: 'C1', projectType: 'client' });
    await createProject(bob.scope, { name: 'C2', projectType: 'client' });
    await createProject(bob.scope, { name: 'I1', projectType: 'internal' });
    await createProject(bob.scope, { name: 'U1' });

    expect(await countProjects(bob.scope, {})).toBe(4);
    expect(await countProjects(bob.scope, { projectType: 'client' })).toBe(2);
    expect(await countProjects(bob.scope, { projectType: 'internal' })).toBe(1);

    // The count and the list agree — that is the whole point of sharing the
    // clause builder between them.
    const listed = await listProjects(bob.scope, { projectType: 'client' });
    expect(listed).toHaveLength(await countProjects(bob.scope, { projectType: 'client' }));
    expect(listed.every((p) => p.projectType === 'client')).toBe(true);
  });

  test('counts are scoped to the workspace', async () => {
    const { countProjects } = await import('../src/lib/server/projects-query');
    const stranger = await makeTenant('stranger-count');
    expect(await countProjects(stranger.scope, {})).toBe(0);
  });
});

describe('links', () => {
  test('kind is stored and validated, and position appends', async () => {
    const { createProject, addLink, updateLink } = await import('../src/lib/server/saveProject');
    const { id } = await createProject(alice.scope, { name: 'Linked' });

    await addLink(alice.scope, id, 'https://github.com/acme/site', 'Repo', 'repo');
    await addLink(alice.scope, id, 'https://example.com/brief', 'Brief', 'doc');

    const links = (await read(id)).links;
    expect(links.map((l) => [l.label, l.kind, l.position])).toEqual([
      ['Repo', 'repo', 0],
      ['Brief', 'doc', 1]
    ]);

    await updateLink(alice.scope, id, links[0].id, undefined, undefined, 'folder');
    expect((await read(id)).links[0].kind).toBe('folder');

    await expect(
      addLink(alice.scope, id, 'https://example.com', null, 'spreadsheet')
    ).rejects.toThrow('invalid_link_kind');
  });

  test('a link with no kind is still accepted', async () => {
    const { createProject, addLink } = await import('../src/lib/server/saveProject');
    const { id } = await createProject(alice.scope, { name: 'Unclassified' });
    await addLink(alice.scope, id, 'https://example.com/x', null);
    expect((await read(id)).links[0].kind).toBeNull();
  });
});

describe('detail shape', () => {
  test('getProject returns milestones and goals alongside the rest', async () => {
    const { createProject } = await import('../src/lib/server/saveProject');
    const plan = await import('../src/lib/server/project-plan');
    const { id } = await createProject(alice.scope, { name: 'Full' });
    await plan.createMilestone(alice.scope, id, { title: 'M' });
    await plan.createGoal(alice.scope, id, { title: 'G', targetValue: 4 });

    const p = await read(id);
    expect(p.milestones.map((m) => m.title)).toEqual(['M']);
    expect(p.goals.map((g) => g.title)).toEqual(['G']);
  });

  test('interactions are capped rather than unbounded', async () => {
    const { PROJECT_INTERACTIONS_LIMIT, getProjectInteractions } = await import(
      '../src/lib/server/projects-query'
    );
    const { createProject } = await import('../src/lib/server/saveProject');
    const { createInteraction } = await import('../src/lib/server/saveInteraction');
    const { attachInteraction } = await import('../src/lib/server/saveProject');

    const { id } = await createProject(alice.scope, { name: 'Chatty' });
    const over = PROJECT_INTERACTIONS_LIMIT + 5;
    for (let i = 0; i < over; i++) {
      const { id: iid } = await createInteraction(alice.scope, {
        title: `Call ${i}`,
        type: 'call',
        occurredAt: Date.now() - i * 1000
      });
      await attachInteraction(alice.scope, id, iid);
    }

    const rows = await getProjectInteractions(alice.scope, id);
    expect(rows).toHaveLength(PROJECT_INTERACTIONS_LIMIT);
    // Newest first, so the cap drops the oldest.
    expect(rows[0].title).toBe('Call 0');
  }, 60_000);
});
