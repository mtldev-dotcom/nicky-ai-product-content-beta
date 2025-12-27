'use server'

import { loadDecryptedSettingsForServer } from '@/app/settings/actions';

export async function getMedusaTaxonomy(orgId: string) {
  const settings = await loadDecryptedSettingsForServer(orgId);
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
      'shipping-profiles',
      'stores',
      'stock-locations'
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

    const [collections, categories, channels, types, shippingProfiles, stores, stockLocations] = results;

    // Extract supported currencies from the first store (Medusa v2 usually has one primary store)
    const activeCurrencies = stores?.stores?.[0]?.supported_currencies?.map((sc: any) => sc.currency) || [];

    return {
      success: true,
      data: {
        collections: collections?.collections || [],
        categories: categories?.product_categories || [],
        sales_channels: channels?.sales_channels || [],
        product_types: types?.product_types || [],
        shipping_profiles: shippingProfiles?.shipping_profiles || [],
        currencies: activeCurrencies,
        stock_locations: stockLocations?.stock_locations || []
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
