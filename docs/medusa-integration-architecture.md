# Medusa Integration Architecture & Implementation Guide

## Overview

This document provides a comprehensive guide to the MedusaJS integration architecture, the problems solved, and how the system works. This is essential reading for future developers working on Medusa integration features.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Key Modules](#key-modules)
4. [Critical Implementation Details](#critical-implementation-details)
5. [Common Issues & Solutions](#common-issues--solutions)
6. [Testing Guidelines](#testing-guidelines)
7. [Future Maintenance](#future-maintenance)

---

## Problem Statement

### Original Issues

1. **Variant Options Format Error**: Medusa API was rejecting product creation with error:
   ```
   Expected type: 'object' for field 'variants, 0, options', got: 'array'
   ```
   - **Root Cause**: Variant options were being sent as arrays `[{ "value": "Black" }]` instead of objects `{ "option_id": "Black" }`
   - **Impact**: Products with variants could not be created in Medusa

2. **Option Value Reference Errors**: After fixing the format, variants failed with:
   ```
   Option value Black does not exist for option opt_01KFYHCJ1F6WGTK55RS9ZRQHCZ
   ```
   - **Root Cause**: When creating variants via `/admin/products/:id/variants`, Medusa requires option **titles** (not IDs) as keys in the options object
   - **Impact**: Two-phase creation failed at variant creation step

3. **Inconsistent Error Handling**: Errors from Medusa were not consistently parsed or displayed
4. **No Retry Logic**: Transient network failures caused permanent failures
5. **Code Duplication**: Authentication and URL normalization duplicated across multiple API routes

---

## Solution Architecture

### High-Level Flow

```
User Action (Push to Medusa)
    ↓
[push-product/route.ts]
    ├─→ Validate Payload (validate-payload.ts)
    ├─→ Sanitize Payload (normalize-product-payload.ts)
    ├─→ Check if Two-Phase Needed (two-phase-creation.ts)
    │
    ├─→ [Two-Phase Path] (if options + variants exist)
    │   ├─→ Phase 1: Create product with options only
    │   ├─→ Extract option IDs and titles from response
    │   ├─→ Wait 1s for option values to commit
    │   ├─→ Phase 2: Create variants with option titles as keys
    │   └─→ Return complete product
    │
    └─→ [Single-Phase Path] (if no options or no variants)
        └─→ Create product with all data at once
```

### Two-Phase Creation Strategy

**Why Two-Phase?**

When creating a product with both options and variants in a single request, Medusa requires variant options to reference option IDs that don't exist yet (chicken-and-egg problem). The two-phase approach solves this:

1. **Phase 1**: Create product with options only
   - Medusa assigns option IDs and creates option values
   - We extract option IDs, titles, and values from the response

2. **Phase 2**: Create variants using the option data from Phase 1
   - Use option **titles** (not IDs) as keys in variant options
   - Use exact option value **strings** (not IDs) as values
   - Format: `{ "Color": "Black" }` not `{ "opt_123": "optval_456" }`

---

## Key Modules

### 1. `client.ts` - Centralized Authentication

**Purpose**: Single source of truth for Medusa API authentication and URL normalization.

**Key Functions**:
- `getMedusaAuth()`: Returns authentication headers and normalized base URL
- `medusaRequest()`: Helper for making authenticated requests

**Benefits**:
- Eliminates code duplication
- Consistent URL normalization (removes trailing slashes, handles `/admin` prefix)
- Centralized error handling for auth failures

**Usage**:
```typescript
const auth = await getMedusaAuth();
if (!auth.ok) {
  return NextResponse.json({ error: auth.error }, { status: auth.status });
}

const res = await fetch(`${auth.baseUrl}/admin/products`, {
  headers: auth.headers,
  // ...
});
```

---

### 2. `two-phase-creation.ts` - Strategic Product Creation

**Purpose**: Implements two-phase product creation for products with options and variants.

**Key Functions**:
- `createProductTwoPhase()`: Orchestrates two-phase creation
- `shouldUseTwoPhase()`: Determines if two-phase is needed

**Critical Implementation Details**:

1. **Option Title Mapping**: 
   - Extracts option titles from Medusa response
   - Maps client option IDs → Medusa option titles
   - **CRITICAL**: Variant creation uses option titles as keys, not IDs

2. **Option Value Mapping**:
   - Extracts exact value strings from Medusa response
   - Maps client values → Medusa values (with case-insensitive fallback)
   - Uses exact Medusa value strings (not IDs) in variant options

3. **Timing**:
   - 1-second delay after Phase 1 to ensure option values are committed
   - Fetches product again after Phase 1 to get latest option structure

**Variant Options Format**:
```typescript
// ✅ CORRECT (what we use)
{
  "options": {
    "Color": "Black"  // Key = option title, Value = option value string
  }
}

// ❌ WRONG (what we tried initially)
{
  "options": {
    "opt_01KFYHCJ1F6WGTK55RS9ZRQHCZ": "Black"  // Using option ID
  }
}

// ❌ ALSO WRONG
{
  "options": {
    "opt_01KFYHCJ1F6WGTK55RS9ZRQHCZ": "optval_01KFYHCJ1FEV7SDFR9D3FVGPSV"  // Using IDs
  }
}
```

---

### 3. `build-admin-product-payload.ts` - Payload Construction

**Purpose**: Transforms internal product state into Medusa Admin API format.

**Key Fixes**:
- **Variant Options Format**: Always uses object format `{ "option_id": "value" }` for both creates and updates
- **Option IDs in Product Options**: Includes client-generated option IDs in product-level options array (allows variants to reference them)
- **Variant ID Validation**: Only includes variant IDs for updates (with UUID validation)

**Critical Sections**:
- Lines 209-288: Variant options mapping (object format)
- Lines 468-493: Product-level options (includes IDs for creates)

---

### 4. `normalize-product-payload.ts` - Payload Sanitization

**Purpose**: Cleans payloads to prevent common Medusa validation errors.

**Key Normalizations**:
- Removes `inventory` fields from variants (Medusa v2 doesn't accept them)
- Removes `null` values for `shipping_profile_id` (Medusa expects string or absence)
- Recursively removes `undefined`/`null` fields (except whitelisted nullable fields)
- Normalizes currency codes to strings

---

### 5. `error-handler.ts` - Structured Error Handling

**Purpose**: Maps Medusa API errors to structured error classes.

**Error Classes**:
- `MedusaApiError` (base)
- `MedusaValidationError` (400)
- `MedusaNotFoundError` (404)
- `MedusaAuthError` (401/403)
- `MedusaServerError` (5xx)
- `MedusaNetworkError` (network failures)

**Key Functions**:
- `parseMedusaError()`: Maps HTTP status + response to error class
- `isRetryableError()`: Determines if error should trigger retry
- `getErrorMessageWithSuggestions()`: User-friendly error messages

---

### 6. `retry.ts` - Exponential Backoff

**Purpose**: Implements retry logic with exponential backoff for transient failures.

**Configuration**:
- Default: 3 retries
- Initial delay: 1000ms
- Max delay: 10000ms
- Backoff multiplier: 2

**Usage**:
```typescript
const res = await withRetry(async () => {
  return fetch(url, options);
});
```

---

### 7. `validate-payload.ts` - Pre-Flight Validation

**Purpose**: Validates payloads before sending to Medusa (catches errors early).

**Validations**:
- Variant structure (required fields, price format)
- Option structure (title, values)
- Variant option values match product-level options
- Inventory field absence (Medusa v2)

**Error Class**: `MedusaPayloadValidationError` (distinct from API validation errors)

---

### 8. `response-parser.ts` - Response Extraction

**Purpose**: Safely extracts IDs and data from varied Medusa response formats.

**Key Functions**:
- `extractProductId()`: Handles `{ product: { id } }` and `{ id }` formats
- `extractVariantId()`: Similar for variants
- `extractOptionId()`: Similar for options
- `parseMedusaResponse()`: Safe JSON parsing with fallback
- `extractMedusaErrorMessage()`: Extracts error messages from varied error formats

---

### 9. `types.ts` - TypeScript Definitions

**Purpose**: Comprehensive type definitions aligned with Medusa Admin API schemas.

**Key Interfaces**:
- `MedusaProductPayload`: Product create/update payload
- `MedusaProductVariant`: Variant structure
- `MedusaProductOption`: Option structure
- `MedusaVariantOptions`: Variant options format `{ "option_id": "value" }`
- `MedusaErrorResponse`: Error response structure

---

### 10. API Routes

**New Dedicated Endpoints**:
- `POST /api/medusa/products/[id]/options` - Create option
- `POST /api/medusa/products/[id]/options/[optionId]` - Update option
- `DELETE /api/medusa/products/[id]/options/[optionId]` - Delete option
- `POST /api/medusa/products/[id]/variants` - Create variant
- `POST /api/medusa/products/[id]/variants/[variantId]` - Update variant
- `DELETE /api/medusa/products/[id]/variants/[variantId]` - Delete variant

**Updated Routes**:
- `POST /api/medusa/push-product` - Uses two-phase creation when needed
- `GET /api/medusa/products` - Uses centralized client
- `POST /api/medusa/products` - Uses centralized client
- `GET /api/medusa/products/[id]` - Uses centralized client
- `POST /api/medusa/products/[id]` - Uses centralized client
- `DELETE /api/medusa/products/[id]` - Uses centralized client

---

## Critical Implementation Details

### 1. Variant Options Format

**For Product Creation/Update (single payload)**:
```typescript
// Format: { "option_id": "value_string" }
{
  "variants": [
    {
      "options": {
        "8ae78caf-5f11-436f-92d8-261161afedeb": "Black"  // Client option ID → value
      }
    }
  ]
}
```

**For Variant Creation via Dedicated Endpoint**:
```typescript
// Format: { "option_title": "value_string" }
{
  "options": {
    "Color": "Black"  // Option title → value string
  }
}
```

**Why the Difference?**
- When creating a product with variants in one request, Medusa accepts option IDs (from product-level options)
- When creating variants via `/admin/products/:id/variants`, Medusa expects option titles (looks up options by title)

---

### 2. Option ID Handling

**Product-Level Options**:
- **Creates**: Include client-generated UUIDs in `id` field (allows variants to reference them)
- **Updates**: Include Medusa-assigned IDs (from existing product)

**Variant Options**:
- **Creates**: Use client option IDs (references product-level option IDs)
- **Updates**: Use Medusa option IDs (from existing product)
- **Via Dedicated Endpoint**: Use option **titles** (not IDs)

---

### 3. Option Value Matching

The two-phase creation uses a sophisticated matching strategy:

1. **Exact Match** (case-sensitive): `"Black" === "Black"`
2. **Case-Insensitive Match**: `"black".toLowerCase() === "Black".toLowerCase()`
3. **Index-Based Match**: Match by position in arrays (fallback)

This handles cases where:
- Client sends "Black" but Medusa stores "black" (or vice versa)
- Values are normalized differently

---

### 4. Timing Considerations

**1-Second Delay After Phase 1**:
- Ensures option values are fully committed in Medusa's database
- Prevents race conditions where option values aren't immediately available
- May need adjustment based on Medusa instance performance

**Fetch Product After Phase 1**:
- Gets the most up-to-date option structure
- Ensures we have Medusa-assigned option IDs and titles
- Verifies option values are accessible

---

### 5. Error Handling Strategy

**Layered Approach**:
1. **Pre-Flight Validation** (`validate-payload.ts`): Catches errors before API call
2. **Payload Sanitization** (`normalize-product-payload.ts`): Prevents common format issues
3. **Retry Logic** (`retry.ts`): Handles transient failures
4. **Structured Errors** (`error-handler.ts`): Provides actionable error messages

**Error Flow**:
```
API Call → Retry (if transient) → Parse Error → Structured Error Class → User-Friendly Message
```

---

## Common Issues & Solutions

### Issue 1: "Expected type: 'object' for field 'variants, 0, options', got: 'array'"

**Cause**: Variant options sent as array instead of object.

**Solution**: Ensure `build-admin-product-payload.ts` uses object format:
```typescript
options: {
  "option_id": "value"  // ✅ Object format
}
```

**Not**:
```typescript
options: [
  { "value": "Black" }  // ❌ Array format
]
```

---

### Issue 2: "Option value X does not exist for option Y"

**Cause**: When creating variants via dedicated endpoint, using option ID as key instead of option title.

**Solution**: Use option title as key:
```typescript
// ✅ CORRECT
{
  "options": {
    "Color": "Black"  // Title as key
  }
}

// ❌ WRONG
{
  "options": {
    "opt_123": "Black"  // ID as key
  }
}
```

**Fix Location**: `two-phase-creation.ts` - uses `optionTitleMap` instead of `optionIdMap` for variant creation.

---

### Issue 3: Product Created But No Variants

**Cause**: Two-phase creation failed at Phase 2 (variant creation).

**Check**:
1. Are option titles being extracted correctly?
2. Are option values matching correctly?
3. Is the delay sufficient (may need to increase)?
4. Check server logs for detailed error messages

**Debug Steps**:
- Enable development logging (already enabled in dev mode)
- Check console for `[Two-Phase]` logs
- Verify option title mapping in logs
- Verify variant payload format

---

### Issue 4: "Product with handle X already exists"

**Cause**: Trying to create a product that already exists in Medusa.

**Solutions**:
1. Delete existing product in Medusa
2. Change product handle
3. Use update endpoint if you have the product ID
4. Dev widget now generates unique handles automatically

**Error Handling**: Returns 409 Conflict with helpful message.

---

### Issue 5: Option Values Not Matching

**Cause**: Case sensitivity or whitespace differences between client and Medusa values.

**Solution**: The matching logic handles this with:
- Exact match (case-sensitive)
- Case-insensitive fallback
- Index-based fallback

**If Still Failing**: Check logs for `[Two-Phase] Option mapping` to see what values are being matched.

---

## Testing Guidelines

### Manual Testing

1. **Create Product with Options and Variants**:
   - Add option (e.g., "Color") with values ("Black", "Gold", "Red")
   - Generate variants
   - Push to Medusa
   - Verify: Product created, all variants created, variants linked to options

2. **Verify Variant Options Format**:
   - Open Browser DevTools → Network tab
   - Filter by "push-product"
   - Inspect request payload
   - Verify: `variants[].options` is object format `{ "option_id": "value" }`

3. **Test Two-Phase Creation**:
   - Create product with options + variants
   - Check Network tab for two requests:
     - Phase 1: POST to `/admin/products` (no variants)
     - Phase 2: Multiple POSTs to `/admin/products/:id/variants`
   - Verify: Variant options use option titles as keys

4. **Test Error Handling**:
   - Try creating product with invalid data
   - Verify: Clear error message with suggestions
   - Try with network offline
   - Verify: Retry logic activates

### Automated Testing

See `docs/medusa-integration-testing-walkthrough.md` for comprehensive test scenarios.

---

## Future Maintenance

### When Adding New Medusa Features

1. **Use Centralized Client**: Always use `getMedusaAuth()` from `client.ts`
2. **Use Retry Logic**: Wrap API calls with `withRetry()`
3. **Use Error Handler**: Use `parseMedusaError()` for consistent error handling
4. **Validate Payloads**: Use `validateMedusaProductPayload()` before sending
5. **Sanitize Payloads**: Use `sanitizeMedusaProductPayload()` to clean data

### When Debugging Issues

1. **Check Development Logs**: Look for `[Two-Phase]` prefixed logs
2. **Verify Payload Format**: Use Network tab to inspect actual requests
3. **Check Medusa Response**: Log full response structure
4. **Verify Option Mapping**: Check option title/value mappings in logs

### Known Limitations

1. **Two-Phase Delay**: 1-second delay may need adjustment for slow Medusa instances
2. **Option Title Matching**: Relies on exact title match (case-sensitive in Medusa)
3. **Concurrent Requests**: Not tested with concurrent product creation
4. **Large Variant Sets**: May need batching for products with 100+ variants

### Potential Improvements

1. **Dynamic Delay**: Adjust delay based on Medusa response time
2. **Batch Variant Creation**: Create multiple variants in single request (if Medusa supports)
3. **Option Title Caching**: Cache option titles to avoid repeated lookups
4. **Better Error Recovery**: Automatic retry with different strategies
5. **Progress Indicators**: Show progress for two-phase creation in UI

---

## Key Learnings

### Medusa API Quirks

1. **Variant Options Format Depends on Endpoint**:
   - Product creation: `{ "option_id": "value" }`
   - Variant creation: `{ "option_title": "value" }`

2. **Option Values Must Match Exactly**:
   - Case-sensitive matching
   - Whitespace matters
   - Must use exact strings from Medusa response

3. **Option IDs vs Titles**:
   - Product-level operations: Use IDs
   - Variant creation via endpoint: Use titles
   - Always extract from Medusa response, don't assume

4. **Timing Matters**:
   - Option values may not be immediately available after creation
   - Delay + re-fetch ensures data consistency

### Best Practices Established

1. **Centralize Common Logic**: Authentication, retry, error handling
2. **Validate Early**: Catch errors before API calls
3. **Sanitize Payloads**: Remove problematic fields before sending
4. **Structured Errors**: Use error classes for better handling
5. **Comprehensive Logging**: Development logs for debugging

---

## File Structure

```
src/lib/medusa/
├── client.ts                    # Centralized authentication
├── error-handler.ts             # Structured error handling
├── retry.ts                     # Exponential backoff retry
├── response-parser.ts           # Response extraction utilities
├── types.ts                     # TypeScript type definitions
├── validate-payload.ts          # Pre-flight validation
├── normalize-product-payload.ts # Payload sanitization
├── build-admin-product-payload.ts # Payload construction
├── two-phase-creation.ts        # Two-phase creation strategy
└── map-medusa-product-to-local.ts # Medusa → Local mapping

src/app/api/medusa/
├── push-product/route.ts        # Main product push endpoint
├── products/route.ts            # List/create products
├── products/[id]/route.ts       # Get/update/delete product
├── products/[id]/options/route.ts           # Create option
├── products/[id]/options/[optionId]/route.ts # Update/delete option
├── products/[id]/variants/route.ts          # Create variant
└── products/[id]/variants/[variantId]/route.ts # Update/delete variant
```

---

## Quick Reference

### Creating a Product with Variants

```typescript
// Automatically uses two-phase if options + variants exist
const response = await fetch('/api/medusa/push-product', {
  method: 'POST',
  body: JSON.stringify({
    payload: {
      title: "Product",
      options: [{ id: "uuid", title: "Color", values: ["Black", "Gold"] }],
      variants: [
        {
          title: "Product - Black",
          options: { "uuid": "Black" },  // Client option ID → value
          prices: [{ amount: 20, currency_code: "usd" }]
        }
      ]
    }
  })
});
```

### Creating a Variant via Dedicated Endpoint

```typescript
// Must use option TITLE as key
const response = await fetch(`/api/medusa/products/${productId}/variants`, {
  method: 'POST',
  body: JSON.stringify({
    payload: {
      title: "Product - Black",
      options: {
        "Color": "Black"  // Option title → value string
      },
      prices: [{ amount: 20, currency_code: "usd" }]
    }
  })
});
```

### Updating an Existing Product

```typescript
// Automatically uses update strategy with ID reconciliation
const response = await fetch(`/api/medusa/products/${productId}`, {
  method: 'POST',
  body: JSON.stringify({
    payload: {
      title: "Updated Product",
      // Options with Medusa IDs (from reconciliation)
      options: [
        { id: "opt_123", title: "Color", values: ["Black", "Gold"] }, // Existing
        { title: "Size", values: ["S", "M"] } // New (no ID)
      ],
      // Variants with Medusa IDs (from reconciliation)
      variants: [
        { 
          id: "var_123", // Medusa ID (from reconciliation)
          title: "Updated Variant",
          options: { "opt_123": "Black" }, // Option IDs as keys
          prices: [{ amount: 25, currency_code: "usd" }]
        },
        { 
          // New variant (no ID)
          title: "New Variant",
          options: { "opt_123": "Gold" },
          prices: [{ amount: 30, currency_code: "usd" }]
        }
      ]
    }
  })
});
```

---

---

## Update Strategy (Phase 2)

### Overview

Product updates have unique challenges compared to creation:
- **ID Preservation**: Must use existing Medusa IDs for options and variants
- **ID Reconciliation**: Local state may have different IDs than Medusa
- **Change Detection**: Need to identify what changed for debugging and optimization
- **Validation**: Must validate IDs exist in Medusa before updating

### Update Flow

```
User Updates Product
    ↓
[product-details/page.tsx] → handleMedusaUpdate()
    ├─→ Save local draft
    ├─→ [update-product-strategy.ts]
    │   ├─→ Step 1: Fetch current Medusa product state (pre-flight)
    │   ├─→ Step 2: Reconcile IDs (map local → Medusa IDs)
    │   ├─→ Step 3: Detect changes (for logging/debugging)
    │   ├─→ Step 4: Apply reconciled IDs to local state
    │   ├─→ Step 5: Build update payload with Medusa IDs
    │   ├─→ Step 6: Validate payload (standard + update-specific)
    │   ├─→ Step 7: Sanitize payload
    │   └─→ Step 8: Send update to Medusa
    └─→ Return updated product
```

### Key Modules for Updates

#### 1. `update-product-strategy.ts` - Update Orchestration

**Purpose**: Orchestrates the complete update flow with pre-flight validation.

**Key Functions**:
- `updateProductInMedusa()`: Main update orchestrator
- `fetchCurrentMedusaProduct()`: Pre-flight fetch of current state

**Features**:
- Pre-flight fetch to get current Medusa state
- ID reconciliation before building payload
- Change detection for debugging
- Comprehensive logging at each step
- Error handling with detailed context

---

#### 2. `reconcile-medusa-ids.ts` - ID Mapping

**Purpose**: Maps local product state IDs to Medusa-assigned IDs.

**Key Functions**:
- `reconcileProductIds()`: Main reconciliation function
- `reconcileOptionIds()`: Map option IDs
- `reconcileVariantIds()`: Map variant IDs
- `applyReconciledIds()`: Apply reconciled IDs to local state

**Matching Strategies**:

**Options**:
1. **Primary**: Match by Medusa ID (if local state has it)
2. **Secondary**: Match by option title (case-insensitive)
3. **Tertiary**: Match by option values (exact set match)
4. **Fallback**: Treat as new option (no ID in payload)

**Variants**:
1. **Primary**: Match by Medusa ID (if local state has it)
2. **Secondary**: Match by SKU (exact match)
3. **Tertiary**: Match by option combination (all options match)
4. **Fallback**: Treat as new variant (no ID in payload)

**Variant Options Mapping**:
- Converts UI format `{ "Color": "Black" }` → Medusa format `{ "opt_123": "Black" }`
- Uses reconciled option IDs as keys

---

#### 3. `detect-product-changes.ts` - Change Detection

**Purpose**: Identifies what changed between local state and Medusa state.

**Key Functions**:
- `detectProductChanges()`: Main change detection
- `detectOptionChanges()`: Option additions/modifications/removals
- `detectVariantChanges()`: Variant additions/modifications/removals
- `formatChangesForLog()`: Format changes for console logging

**Change Types**:
- **Added**: New options/variants in local state
- **Modified**: Existing options/variants with changes
- **Removed**: Options/variants in Medusa but not in local

**Usage**: Primarily for debugging and logging, but can be used for:
- User feedback (show what will change)
- Payload optimization (only send changes - future enhancement)
- Audit logging

---

### Update Payload Format

**Product Update** (`POST /admin/products/:id`):
```typescript
{
  title: "Updated Title",
  options: [
    { id: "opt_123", title: "Color", values: ["Black", "Gold"] }, // Update existing
    { title: "Size", values: ["S", "M"] } // New option (no ID)
  ],
  variants: [
    { id: "var_123", title: "Updated Variant", options: { "opt_123": "Black" } }, // Update existing
    { title: "New Variant", options: { "opt_123": "Gold" } } // New variant (no ID)
  ]
}
```

**Key Rules**:
- Include `id` for existing options/variants (from reconciliation)
- Omit `id` for new options/variants
- Variant options use option IDs as keys: `{ "opt_123": "Black" }`
- Option values are strings (not objects with IDs)

---

### Update-Specific Validation

**Functions** (in `validate-payload.ts`):
- `validateUpdatePayload()`: Validate update against current Medusa state
- `validateOptionIds()`: Ensure option IDs exist in Medusa
- `validateVariantIds()`: Ensure variant IDs exist in Medusa
- `validateVariantOptions()`: Ensure variant options reference valid option IDs and values

**Validation Rules**:
1. Option IDs must exist in Medusa (or be omitted for new options)
2. Variant IDs must exist in Medusa (or be omitted for new variants)
3. Variant option values must match existing option values (exact match)
4. Option values must be strings (not objects)

---

### Update vs Create Differences

| Aspect | Create | Update |
|--------|--------|--------|
| **Strategy** | Two-phase (if options + variants) | Single-phase with reconciliation |
| **Option IDs** | Client-generated UUIDs (or omit) | Medusa IDs (from reconciliation) |
| **Variant IDs** | Omitted (Medusa assigns) | Medusa IDs (from reconciliation) |
| **Variant Options** | Option IDs from product-level options | Option IDs from reconciled mapping |
| **Pre-flight** | None needed | Fetch current state for reconciliation |
| **Validation** | Standard validation | Standard + update-specific validation |

---

### Common Update Issues & Solutions

#### Issue 1: "Option ID not found"

**Cause**: Option ID in payload doesn't exist in Medusa.

**Solution**: Reconciliation should prevent this, but if it occurs:
- Check if option was deleted in Medusa
- Verify reconciliation matched correctly
- Check console logs for reconciliation details

---

#### Issue 2: "Variant ID not found"

**Cause**: Variant ID in payload doesn't exist in Medusa.

**Solution**: Reconciliation should prevent this, but if it occurs:
- Check if variant was deleted in Medusa
- Verify reconciliation matched by SKU or options
- Check console logs for reconciliation details

---

#### Issue 3: "Option value does not exist"

**Cause**: Variant option value doesn't match any option values.

**Solution**: 
- Ensure option value exists in product-level options
- Check for case sensitivity issues
- Verify reconciliation mapped values correctly

---

#### Issue 4: Update doesn't reflect changes

**Cause**: IDs not reconciled correctly, or changes not detected.

**Solution**:
- Check console logs for reconciliation results
- Verify change detection shows expected changes
- Check if payload includes all expected fields

---

### Update Logging

All update operations log with `[Update]` prefix:

```
[Update] Starting product update for: prod_123
[Update] Fetching current Medusa product state...
[Update] Current Medusa state: { productId, title, optionsCount, variantsCount }
[Update] Reconciling IDs...
[Update] ID Reconciliation: { options: {...}, variants: {...} }
[Update] Detecting changes...
[Update] Changes detected: [formatted change list]
[Update] Building update payload...
[Update] Payload preview: { title, handle, optionsCount, variantsCount }
[Update] Validating payload...
[Update] Sending update request to Medusa...
[Update] Update successful: { productId, title, optionsCount, variantsCount }
```

---

## Conclusion

The Medusa integration has been significantly improved with:

✅ **Fixed Critical Bugs**: Variant options format, option value references  
✅ **Architectural Improvements**: Centralized client, error handling, retry logic  
✅ **Update Strategy**: Pre-flight validation, ID reconciliation, change detection  
✅ **Better Developer Experience**: Comprehensive logging, structured errors  
✅ **Robustness**: Validation, sanitization, retry logic  
✅ **Maintainability**: Clear module separation, comprehensive types  

**Key Innovations**:

1. **Two-Phase Creation**: Solves the chicken-and-egg problem of referencing option IDs that don't exist yet
2. **ID Reconciliation**: Maps local IDs to Medusa IDs using multiple matching strategies
3. **Change Detection**: Identifies what changed for debugging and future optimization
4. **Update Validation**: Validates IDs exist in Medusa before updating

**Critical Details to Remember**:

- **Variant Options Format**:
  - Product creation/update: `{ "option_id": "value" }`
  - Variant creation via endpoint: `{ "option_title": "value" }`
- **Option Values**: Must match exactly (case-sensitive) with Medusa's stored values
- **ID Preservation**: Always preserve Medusa IDs when loading products
- **Reconciliation**: Always reconcile IDs before updating (pre-flight fetch required)
