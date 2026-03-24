'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { encrypt } from '@/lib/crypto'
import { z } from 'zod'

const OrgNameSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(100),
});

const WizardSettingsSchema = z.object({
  storePlatform: z.string().optional(),
  medusaUrl: z.string().url().optional().or(z.literal('')),
  medusaApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  brandName: z.string().max(100).optional(),
  brandVoice: z.string().max(500).optional(),
});

export async function createOrganization(formData: FormData) {
  const supabase = await createClient()

  const { name } = OrgNameSchema.parse({ name: formData.get('name') });
  const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 1. Create Organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ 
      name, 
      slug,
      created_by: user.id
    })
    .select()
    .single()

  if (orgError) {
    redirect('/onboarding?error=' + encodeURIComponent(orgError.message))
  }

  // 2. Add User as Owner
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner'
    })

  if (memberError) {
    // Cleanup if member creation fails
    await supabase.from('organizations').delete().eq('id', org.id)
    redirect('/onboarding?error=' + encodeURIComponent(memberError.message))
  }

  // 3. Create default settings
  await supabase.from('organization_settings').insert({
    organization_id: org.id
  })

  revalidatePath('/', 'layout')
  return { success: true, organizationId: org.id }
}

export async function saveWizardSettings(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return { success: false, error: 'No organization found' }
  }

  const orgId = membership.organization_id

  // Get current settings
  const { data: currentSettings } = await supabase
    .from('organization_settings')
    .select('*')
    .eq('organization_id', orgId)
    .single()

  if (!currentSettings) {
    return { success: false, error: 'Settings not found' }
  }

  // Validate form data at the server action boundary.
  const fields = WizardSettingsSchema.parse({
    storePlatform: formData.get('storePlatform') ?? undefined,
    medusaUrl: formData.get('medusaUrl') ?? undefined,
    medusaApiKey: formData.get('medusaApiKey') ?? undefined,
    openaiApiKey: formData.get('openaiApiKey') ?? undefined,
    brandName: formData.get('brandName') ?? undefined,
    brandVoice: formData.get('brandVoice') ?? undefined,
  });

  // Prepare update object
  const updates: Record<string, unknown> = {}

  if (fields.storePlatform) {
    updates.store_platform = fields.storePlatform
  }

  if (fields.medusaUrl) {
    updates.medusa_url = fields.medusaUrl.trim()
  }

  if (fields.medusaApiKey && fields.medusaApiKey.trim().length > 0) {
    updates.medusa_api_key = encrypt(fields.medusaApiKey.trim())
  }

  if (fields.openaiApiKey && fields.openaiApiKey.trim().length > 0) {
    updates.openai_api_key = encrypt(fields.openaiApiKey.trim())
  }

  if (fields.brandName) {
    updates.brand_name = fields.brandName.trim()
  }

  if (fields.brandVoice) {
    updates.brand_voice = fields.brandVoice.trim()
  }

  // Update settings
  const { error } = await supabase
    .from('organization_settings')
    .update(updates)
    .eq('organization_id', orgId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}