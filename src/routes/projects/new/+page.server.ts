import { requireScope } from '$lib/server/scope';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import {
  createProject,
  attachPerson,
  attachCompany,
  isBillingType,
  isProjectStatus,
  isProjectType,
  type ManualProjectInput
} from '$lib/server/saveProject';
import { BILLING_MONEY_FIELD, type ProjectType } from '$lib/projectTypes';

function dollarsToCents(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) throw redirect(303, '/auth?next=/projects/new');
    const s = requireScope(locals);
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });

    const status = String(data.get('status') ?? 'active');
    if (!isProjectStatus(status)) return fail(400, { error: 'Invalid status.' });

    const billingType = String(data.get('billingType') ?? 'none');
    if (!isBillingType(billingType)) return fail(400, { error: 'Invalid billing type.' });

    // Empty means "unset", which is a valid answer — only a non-empty value
    // that isn't in the list is a rejection.
    const projectTypeRaw = String(data.get('projectType') ?? '');
    let projectType: ProjectType | null = null;
    if (projectTypeRaw) {
      if (!isProjectType(projectTypeRaw)) return fail(400, { error: 'Invalid project type.' });
      projectType = projectTypeRaw;
    }

    const input: ManualProjectInput = {
      name,
      description: (data.get('description') as string | null) || null,
      status,
      projectType,
      startDate: (data.get('startDate') as string | null) || null,
      endDate: (data.get('endDate') as string | null) || null,
      billingType,
      currency: (data.get('currency') as string | null)?.toUpperCase() || null,
      icon: (data.get('icon') as string | null) || null
    };
    // The form posts one `amount` field whichever billing type is selected;
    // which column it lands in is the billing type's business, not the form's.
    const moneyField = BILLING_MONEY_FIELD[billingType];
    if (moneyField) input[moneyField] = dollarsToCents(String(data.get('amount') ?? ''));

    let id: string;
    try {
      const result = await createProject(s, input);
      id = result.id;
    } catch (err) {
      return fail(400, { error: (err as Error).message });
    }

    // Optional members from the form (CSV of ids).
    const personIds = String(data.get('personIds') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const companyIds = String(data.get('companyIds') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pid of personIds) {
      try {
        await attachPerson(s, id, pid);
      } catch {
        // Skip silently — best-effort during initial save.
      }
    }
    for (const cid of companyIds) {
      try {
        await attachCompany(s, id, cid);
      } catch {
        // ignore
      }
    }

    throw redirect(303, `/projects/${id}?just=1`);
  }
};
