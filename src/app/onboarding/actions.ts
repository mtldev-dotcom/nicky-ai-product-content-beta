'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { encrypt } from '@/lib/crypto'

export async function createOrganization(formData: FormData) {
  const supabase = await createClient()
  
  const name = formData.get('name') as string
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

  // Prepare update object
  const updates: Record<string, unknown> = {}

  // Store settings (optional)
  const storePlatform = formData.get('storePlatform') as string
  const medusaUrl = formData.get('medusaUrl') as string
  const medusaApiKey = formData.get('medusaApiKey') as string

  if (storePlatform) {
    updates.store_platform = storePlatform
  }

  if (medusaUrl) {
    updates.medusa_url = medusaUrl.trim()
  }

  if (medusaApiKey && medusaApiKey.trim().length > 0) {
    // Encrypt the API key
    const encrypted = encrypt(medusaApiKey.trim())
    updates.medusa_api_key = encrypted
  }

  // AI settings
  const openaiApiKey = formData.get('openaiApiKey') as string
  const brandName = formData.get('brandName') as string
  const brandVoice = formData.get('brandVoice') as string

  if (openaiApiKey && openaiApiKey.trim().length > 0) {
    const encrypted = encrypt(openaiApiKey.trim())
    updates.openai_api_key = encrypted
  }

  if (brandName) {
    updates.brand_name = brandName.trim()
  }

  if (brandVoice) {
    updates.brand_voice = brandVoice.trim()
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