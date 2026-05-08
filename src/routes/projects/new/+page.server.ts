import { fail, redirect, type Actions } from '@sveltejs/kit';
import {
  createProject,
  attachPerson,
  attachCompany,
  isBillingType,
  isProjectStatus,
  type ManualProjectInput
} from '$lib/server/saveProject';

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
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name is required.' });

    const status = String(data.get('status') ?? 'active');
    if (!isProjectStatus(status)) return fail(400, { error: 'Invalid status.' });

    const billingType = String(data.get('billingType') ?? 'none');
    if (!isBillingType(billingType)) return fail(400, { error: 'Invalid billing type.' });

    const input: ManualProjectInput = {
      name,
      description: (data.get('description') as string | null) || null,
      status,
      startDate: (data.get('startDate') as string | null) || null,
      endDate: (data.get('endDate') as string | null) || null,
      billingType,
      currency: (data.get('currency') as string | null)?.toUpperCase() || null,
      nextStep: (data.get('nextStep') as string | null) || null
    };
    if (billingType === 'hourly') {
      const hr = String(data.get('hourlyRate') ?? '');
      input.hourlyRate = dollarsToCents(hr);
    }
    if (billingType === 'fixed') {
      const ff = String(data.get('fixedFee') ?? '');
      input.fixedFee = dollarsToCents(ff);
    }

    let id: string;
    try {
      const result = await createProject(locals.user.id, locals.user.region, input);
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
        await attachPerson(locals.user.id, locals.user.region, id, pid);
      } catch {
        // Skip silently — best-effort during initial save.
      }
    }
    for (const cid of companyIds) {
      try {
        await attachCompany(locals.user.id, locals.user.region, id, cid);
      } catch {
        // ignore
      }
    }

    throw redirect(303, `/projects/${id}?just=1`);
  }
};
