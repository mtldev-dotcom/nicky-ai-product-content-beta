import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const code = requestUrl.searchParams.get('code')

  // If we have a code, exchange it for a session
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Redirect to confirmation page or onboarding
      return NextResponse.redirect(new URL('/auth/confirm?success=true', request.url))
    }
  }

  // If we have a token_hash, redirect to our confirmation page
  if (tokenHash && type) {
    return NextResponse.redirect(
      new URL(`/auth/confirm?token_hash=${tokenHash}&type=${type}`, request.url)
    )
  }

  // Fallback: redirect to login
  return NextResponse.redirect(new URL('/login', request.url))
}
