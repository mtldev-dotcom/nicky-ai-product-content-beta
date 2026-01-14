'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  // type-casting here for convenience
  // in practice, you should use a library like zod for validation
  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  // Get the base URL for email redirect
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                  'http://localhost:3000'
  
  const emailRedirectTo = `${baseUrl}/auth/confirm`

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    options: {
      emailRedirectTo,
      data: {
        full_name: formData.get('full_name') as string,
      }
    }
  }

  const { data: signupData, error } = await supabase.auth.signUp(data)

  if (error) {
    console.error('Signup error:', error)
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  // Check if email confirmation is required
  // In development, Supabase might auto-confirm emails
  // In production, emails need to be confirmed
  if (signupData?.user && !signupData?.session) {
    // User created but not confirmed - email sent
    revalidatePath('/', 'layout')
    redirect('/login?message=Check your email to confirm your account')
  } else if (signupData?.session) {
    // User auto-confirmed (common in development)
    revalidatePath('/', 'layout')
    redirect('/onboarding')
  } else {
    // Fallback
    revalidatePath('/', 'layout')
    redirect('/login?message=Check your email to confirm your account')
  }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

