'use server'

import { loadEncryptedSettings } from '@/app/settings/actions';

export async function getMedusaTaxonomy(orgId: string) {
  const settings = await loadEncryptedSettings(orgId);
  if (!settings || !settings.medusaUrl || !settings.medusaApiKey || settings.storePlatform !== 'medusa') {
    return {
      success: false,
      error: 'MedusaJS integration not configured'
    };
  }

  // Normalize URL: Remove trailing slash and any existing /admin prefix to avoid duplication
  let baseUrl = settings.medusaUrl.trim().replace(/\/$/, '');
  if (baseUrl.endsWith('/admin')) {
    baseUrl = baseUrl.replace(/\/admin$/, '');
  }
  
  const apiKey = settings.medusaApiKey;

  /**
   * Medusa V2 Authentication:
   * 1. JWT tokens use 'Bearer'
   * 2. Secret API Keys use 'Basic' (base64 encoded key:) or 'x-medusa-access-token'
   * We provide both for maximum compatibility across V1/V2 setups.
   */
  const headers = {
    'x-medusa-access-token': apiKey,
    'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json'
  };

  try {
    const endpoints = [
      'collections',
      'product-categories',
      'sales-channels',
      'product-types',
      'shipping-options'
    ];

    const results = await Promise.all(
      endpoints.map(async (endpoint) => {
        const url = `${baseUrl}/admin/${endpoint}`;
        try {
          const res = await fetch(url, { 
            headers,
            cache: 'no-store' 
          });
          
          if (!res.ok) {
            console.error(`Medusa API Error [${endpoint}]:`, res.status, res.statusText);
            return null;
          }
          
          return res.json();
        } catch (e) {
          console.error(`Fetch failed for [${endpoint}]:`, e);
          return null;
        }
      })
    );

    const [collections, categories, channels, types, shippingOptions] = results;

    return {
      success: true,
      data: {
        collections: collections?.collections || [],
        categories: categories?.product_categories || [],
        sales_channels: channels?.sales_channels || [],
        product_types: types?.product_types || [],
        shipping_options: shippingOptions?.shipping_options || []
      }
    };
  } catch (err) {
    console.error('Failed to fetch Medusa taxonomy:', err);
    return {
      success: false,
      error: 'Failed to connect to MedusaJS server'
    };
  }
}
