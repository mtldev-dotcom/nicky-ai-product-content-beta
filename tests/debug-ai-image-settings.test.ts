/**
 * Test script to verify AI image provider/model settings are saved correctly
 * Run with: npx tsx tests/debug-ai-image-settings.test.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { config } from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAiImageSettingsSave() {
  console.log('🧪 Testing AI Image Settings Save...\n');

  // Get a test organization ID (you'll need to replace this with a real org ID)
  const { data: orgs, error: orgError } = await supabase
    .from('organization_settings')
    .select('organization_id')
    .limit(1);

  if (orgError || !orgs || orgs.length === 0) {
    console.error('❌ No organizations found:', orgError);
    return;
  }

  const testOrgId = orgs[0].organization_id;
  console.log(`📋 Using organization: ${testOrgId}\n`);

  // Read current values
  const { data: before, error: readError } = await supabase
    .from('organization_settings')
    .select('ai_image_provider, ai_image_model')
    .eq('organization_id', testOrgId)
    .single();

  if (readError) {
    console.error('❌ Error reading current settings:', readError);
    return;
  }

  console.log('📖 Current values:', {
    ai_image_provider: before?.ai_image_provider,
    ai_image_model: before?.ai_image_model,
  });

  // Test update with new values
  const testProvider = 'gemini';
  const testModel = 'gemini-3-pro-image-preview';

  console.log(`\n💾 Attempting to update to:`, {
    ai_image_provider: testProvider,
    ai_image_model: testModel,
  });

  const { data: updated, error: updateError } = await supabase
    .from('organization_settings')
    .update({
      ai_image_provider: testProvider,
      ai_image_model: testModel,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', testOrgId)
    .select('ai_image_provider, ai_image_model')
    .single();

  if (updateError) {
    console.error('❌ Error updating settings:', updateError);
    return;
  }

  console.log('✅ Update response:', updated);

  // Verify the update
  const { data: verified, error: verifyError } = await supabase
    .from('organization_settings')
    .select('ai_image_provider, ai_image_model')
    .eq('organization_id', testOrgId)
    .single();

  if (verifyError) {
    console.error('❌ Error verifying update:', verifyError);
    return;
  }

  console.log('\n🔍 Verified values:', {
    ai_image_provider: verified?.ai_image_provider,
    ai_image_model: verified?.ai_image_model,
  });

  if (verified?.ai_image_provider === testProvider && verified?.ai_image_model === testModel) {
    console.log('\n✅ SUCCESS: Values were saved correctly!');
  } else {
    console.log('\n❌ FAILURE: Values do not match expected values');
    console.log('Expected:', { provider: testProvider, model: testModel });
    console.log('Got:', { provider: verified?.ai_image_provider, model: verified?.ai_image_model });
  }
}

testAiImageSettingsSave().catch(console.error);
