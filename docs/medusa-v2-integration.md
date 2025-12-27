# MedusaJS v2 Integration Details

This document outlines the technical implementation details for the MedusaJS v2 integration within Product Architect.

## 1. Variant Generation Logic

The application uses a **Cartesian Product** engine to generate all possible combinations of product options (e.g., Color x Size).

### Naming Conventions
To prevent data collisions and ensure uniqueness in the Medusa Admin:
- **Variant Title**: `[Product Title] - [Value 1] / [Value 2]`
- **Variant SKU**: `[Product Handle]-[slugified-values]` (e.g., `urban-chain-bracelet-black-18cm`)

### Default Fallback
If no options are defined, clicking "Generate Variants" produces a single **Default Variant**:
- **Title**: `[Product Title] - Default Variant`
- **SKU**: `[Product Handle]-default`

## 2. Pricing Architecture

Product Architect supports Medusa's multi-currency architecture.

### Currency Handling
- **Source**: Active currencies are fetched directly from the store configuration via `/admin/stores`.
- **Validation**: The UI prevents duplicate price entries for the same currency within a single variant.
- **Unit Precision**: In accordance with MedusaJS v2 standards, prices are handled in **Major Currency Units** (decimals, e.g., `56.00`) rather than cents (`5600`). This ensures consistency with modern Medusa Admin expectations.

## 3. Inventory Management

### Compatibility Note
MedusaJS v2 separates product creation from inventory management.
- **Payload**: The `inventory` field is **omitted** from the `POST /admin/products` JSON export to prevent `invalid_data` errors.
- **Workflow**: 
    1. Create product/variants via the JSON Blueprint.
    2. Manage stock levels via the dedicated Medusa Inventory/Stock Location APIs or the Medusa Admin dashboard.
- **Architecture**: Our tool allows users to track desired stock levels per **Stock Location** (fetched via `/admin/stock-locations`), which can be used for future direct-sync features.

## 4. Taxonomy Sync

The `getMedusaTaxonomy` action performs a multi-endpoint fetch to hydrate the UI:
- **Collections**: `/admin/collections`
- **Categories**: `/admin/product-categories`
- **Sales Channels**: `/admin/sales-channels`
- **Product Types**: `/admin/product-types`
- **Shipping Profiles**: `/admin/shipping-profiles`
- **Store Config**: `/admin/stores` (for active currencies)
- **Locations**: `/admin/stock-locations`

### Security Note
- Medusa credentials are stored encrypted-at-rest in Supabase and are decrypted only on the server when performing taxonomy requests.
- The browser never receives the stored Medusa Admin API key; the Settings UI supports “replace” semantics only.

