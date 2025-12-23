'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function createOrganization(formData: FormData) {
  const supabase = await createClient()
  
  const name = formData.get('name') as string
  const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Start a transaction-like flow (Supabase doesn't have cross-table transactions in JS SDK, 
  // but we can do these sequentially or use an RPC)
  
  // 1. Create Organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ 
      name, 
      slug,
      created_by: user.id // Explicitly set created_by
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
  redirect('/')
}

