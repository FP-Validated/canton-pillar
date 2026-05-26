'use server';
import { revalidatePath } from 'next/cache';
import { adminAction } from '../../server/pillar-admin-client';

export async function mutateAdmin(path: string, body?: Record<string, unknown>, secondApproverEmail?: string) {
  const result = await adminAction(path, body, secondApproverEmail);
  revalidatePath('/');
  if (!result.ok) throw new Error(result.error.code);
}
