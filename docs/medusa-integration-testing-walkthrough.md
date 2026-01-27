# Medusa Integration Testing Walkthrough

This document provides step-by-step testing scenarios to verify the Medusa integration improvements, bug fixes, and new features.

> **See Also**: `docs/medusa-integration-architecture.md` for detailed architecture and implementation guide.

## Prerequisites

- Medusa backend running and accessible
- Medusa API credentials configured in Settings
- Development environment running (`npm run dev`)
- Browser DevTools open (Network tab recommended)

---

## Test Scenario 1: Create Product with Options and Variants (Critical Bug Fix)

**Objective**: Verify that variant options are sent in object format `{ "option_id": "value" }` and that option IDs are included in product-level options.

### Steps:

1. **Navigate to Create Product Page**
   - Go to `/create` in your browser
   - Verify the page loads correctly

2. **Set Up Product Basics**
   - Enter product title: `Test Product - Variant Options`
   - Add a description
   - Upload at least one image
   - Set a price (e.g., `30`)

3. **Add Product Option**
   - In "Add Option" section, type: `Color`
   - Click "ADD OPTION"
   - Add option values: `Black`, `Gold`, `Red`
   - Verify all three values appear as tags

4. **Generate Variants**
   - Click "Generate Variants" or manually create variants
   - Verify 3 variants are created (one for each color)
   - Each variant should show the color in its title

5. **Verify Variant Options Format (DevTools)**
   - Open Browser DevTools → Network tab
   - Filter by "push-product" or "products"
   - Click "Push to Medusa" button
   - **Expected**: Request should succeed (200/201)
   - **Check Payload**: In Network tab, inspect the request payload
   - **Verify**: `variants[].options` should be an **object** format:
     ```json
     {
       "variants": [
         {
           "options": {
             "8ae78caf-5f11-436f-92d8-261161afedeb": "Black"
           }
         }
       ]
     }
     ```
   - **NOT** an array format like `[{ "value": "Black" }]`

6. **Verify Product-Level Options Include IDs**
   - In the same payload, check the `options` array
   - **Expected**: Each option should have an `id` field:
     ```json
     {
       "options": [
         {
           "id": "8ae78caf-5f11-436f-92d8-261161afedeb",
           "title": "Color",
           "values": ["Black", "Gold", "Red"]
         }
       ]
     }
     ```

7. **Verify Success**
   - Product should be created successfully
   - No error about "Expected type: 'object' for field 'variants, 0, options'"
   - Product ID should be returned and stored

### Success Criteria:
- ✅ Product created without 400 errors
- ✅ Variant options in object format `{ "option_id": "value" }`
- ✅ Option IDs present in product-level options array
- ✅ All variants linked correctly to options

---

## Test Scenario 2: Update Existing Product

**Objective**: Verify that updates work correctly with variant IDs and option IDs.

### Steps:

1. **Load Existing Product**
   - Use a product that was previously created in Medusa
   - Or create a new product first (Scenario 1)
   - Navigate to `/product-details` page

2. **Modify Product Data**
   - Change the product title
   - Modify variant prices
   - Update option values (add/remove values)

3. **Push Update to Medusa**
   - Click "Push to Medusa" button
   - **Expected**: Update should succeed
   - **Check Payload**: Verify that:
     - Variant `id` fields are included (for existing variants)
     - Option `id` fields are included (for existing options)
     - Variant options still use object format

4. **Verify Changes in Medusa**
   - Check Medusa admin panel or fetch product via API
   - Verify changes are reflected

### Success Criteria:
- ✅ Update succeeds without errors
- ✅ Variant IDs included for existing variants
- ✅ Option IDs included for existing options
- ✅ Changes persist in Medusa

---

## Test Scenario 3: Two-Phase Product Creation

**Objective**: Verify that products with both options and variants use two-phase creation when appropriate.

### Steps:

1. **Create Product with Options and Variants**
   - Follow Scenario 1 steps
   - Ensure product has:
     - At least one option with multiple values
     - Multiple variants generated from those options

2. **Monitor Network Requests**
   - Open DevTools → Network tab
   - Clear network log
   - Click "Push to Medusa"

3. **Verify Two-Phase Flow**
   - **Phase 1**: Should see a POST to `/admin/products` with:
     - `options` array populated
     - `variants` array **empty** or missing
   - **Phase 2**: Should see multiple POST requests to `/admin/products/{id}/variants`:
     - One request per variant
     - Each variant should have `options` object with Medusa-assigned option IDs

4. **Check Server Logs**
   - Look for console logs indicating two-phase creation
   - Verify option ID mapping (client UUIDs → Medusa IDs)

### Success Criteria:
- ✅ Two-phase creation activates when product has options + variants
- ✅ Phase 1 creates product with options only
- ✅ Phase 2 adds variants with correct option ID references
- ✅ Final product has all variants correctly linked

---

## Test Scenario 4: Single Variant Product (No Options)

**Objective**: Verify products without options work correctly.

### Steps:

1. **Create Simple Product**
   - Navigate to `/create`
   - Enter title: `Simple Product - No Options`
   - Add description and image
   - **Do NOT add any options**

2. **Push to Medusa**
   - Click "Push to Medusa"
   - **Expected**: Should use single-phase creation (not two-phase)
   - **Check Payload**: Should have:
     - Default variant or single variant
     - No `options` field in variants (or empty)
     - Default option in product-level options (if required)

3. **Verify Success**
   - Product created successfully
   - Single variant exists in Medusa

### Success Criteria:
- ✅ Product creates without errors
- ✅ Single-phase creation used (no two-phase)
- ✅ Default variant created correctly

---

## Test Scenario 5: Error Handling and Validation

**Objective**: Verify improved error messages and validation.

### Steps:

1. **Test Missing Required Fields**
   - Create a product without a title
   - Try to push to Medusa
   - **Expected**: Clear validation error before sending to Medusa

2. **Test Invalid Variant Data**
   - Create a variant without prices
   - Try to push
   - **Expected**: Validation error: "Variant must have at least one price"

3. **Test Invalid Option Values**
   - Create a variant with option value that doesn't match product-level options
   - Try to push
   - **Expected**: Validation error indicating which value is invalid

4. **Test Network Error Handling**
   - Temporarily disable Medusa server or use invalid URL
   - Try to push product
   - **Expected**: 
     - Retry attempts visible in console (up to 3 retries)
     - Clear error message about network/connection issue
     - Structured error type (MedusaNetworkError)

5. **Test Medusa API Errors**
   - Create a product with duplicate handle (if one exists)
   - Try to push
   - **Expected**: 
     - Detailed error message from Medusa
     - Error details shown in UI
     - Suggestion for resolution

### Success Criteria:
- ✅ Validation errors caught before API call
- ✅ Clear, actionable error messages
- ✅ Retry logic activates for network errors
- ✅ Medusa API errors parsed and displayed clearly

---

## Test Scenario 6: Dedicated Option Management Endpoints

**Objective**: Test the new option CRUD endpoints.

### Steps:

1. **Create Option via Dedicated Endpoint**
   - First, create a product in Medusa (or use existing)
   - Get the product ID from Medusa
   - Use API directly or create a test script:
     ```javascript
     fetch('/api/medusa/products/{productId}/options', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         payload: {
           title: 'Size',
           values: ['Small', 'Medium', 'Large']
         }
       })
     })
     ```
   - **Expected**: Option created successfully
   - **Verify**: Option ID returned in response

2. **Update Option via Dedicated Endpoint**
   - Use the option ID from step 1
   - Update option values:
     ```javascript
     fetch('/api/medusa/products/{productId}/options/{optionId}', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         payload: {
           title: 'Size',
           values: ['XS', 'Small', 'Medium', 'Large', 'XL']
         }
       })
     })
     ```
   - **Expected**: Option updated successfully

3. **Delete Option via Dedicated Endpoint**
   - Delete the option:
     ```javascript
     fetch('/api/medusa/products/{productId}/options/{optionId}', {
       method: 'DELETE'
     })
     ```
   - **Expected**: Option deleted successfully
   - **Verify**: Option no longer exists in product

### Success Criteria:
- ✅ Option CRUD operations work via dedicated endpoints
- ✅ Proper error handling for invalid option IDs
- ✅ Options can be managed independently of product updates

---

## Test Scenario 7: Dedicated Variant Management Endpoints

**Objective**: Test the new variant CRUD endpoints.

### Steps:

1. **Create Variant via Dedicated Endpoint**
   - Use an existing product with options
   - Create a new variant:
     ```javascript
     fetch('/api/medusa/products/{productId}/variants', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         payload: {
           title: 'Test Product - New Variant',
           sku: 'test-product-new-variant',
           options: {
             "{optionId}": "NewValue"
           },
           prices: [
             { amount: 25, currency_code: 'usd' }
           ]
         }
       })
     })
     ```
   - **Expected**: Variant created successfully
   - **Verify**: Variant ID returned

2. **Update Variant via Dedicated Endpoint**
   - Update variant price:
     ```javascript
     fetch('/api/medusa/products/{productId}/variants/{variantId}', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         payload: {
           prices: [
             { amount: 30, currency_code: 'usd' }
           ]
         }
       })
     })
     ```
   - **Expected**: Variant updated successfully

3. **Delete Variant via Dedicated Endpoint**
   - Delete the variant:
     ```javascript
     fetch('/api/medusa/products/{productId}/variants/{variantId}', {
       method: 'DELETE'
     })
     ```
   - **Expected**: Variant deleted successfully
   - **Verify**: Variant no longer exists

### Success Criteria:
- ✅ Variant CRUD operations work via dedicated endpoints
- ✅ Proper error handling for invalid variant IDs
- ✅ Variants can be managed independently

---

## Test Scenario 8: Payload Sanitization

**Objective**: Verify that payload sanitization handles edge cases correctly.

### Steps:

1. **Test Inventory Field Removal**
   - Create a product with variants that have `inventory` field in local state
   - Push to Medusa
   - **Check Payload**: `inventory` field should NOT be present in request
   - **Expected**: Product creates successfully (Medusa v2 doesn't accept inventory in product payload)

2. **Test Shipping Profile ID Handling**
   - Create product with `shipping_profile_id: null`
   - Push to Medusa
   - **Check Payload**: `shipping_profile_id` should be **omitted** (not sent as null)
   - **Expected**: No "Expected type: 'string' for field 'shipping_profile_id', got: 'null'" error

3. **Test Currency Code Normalization**
   - Create variant with price object: `{ amount: 20, currency_code: { code: "USD" } }`
   - Push to Medusa
   - **Check Payload**: `currency_code` should be normalized to string `"usd"`
   - **Expected**: Product creates successfully

### Success Criteria:
- ✅ Inventory fields removed from payload
- ✅ Null shipping_profile_id omitted
- ✅ Currency codes normalized to strings
- ✅ No validation errors from sanitization issues

---

## Test Scenario 9: Retry Logic and Network Resilience

**Objective**: Verify retry logic works for transient failures.

### Steps:

1. **Simulate Network Failure**
   - Use browser DevTools → Network tab → Throttling
   - Set to "Offline" or "Slow 3G"
   - Try to push a product
   - **Expected**: 
     - Retry attempts visible in console
     - Up to 3 retry attempts with exponential backoff
     - Clear error message if all retries fail

2. **Simulate Server Error (5xx)**
   - Temporarily cause Medusa to return 500 error (if possible)
   - Try to push product
   - **Expected**: 
     - Retry logic activates
     - Error classified as MedusaServerError
     - Appropriate error message shown

3. **Test Successful Retry**
   - Simulate transient failure that recovers
   - Try to push product
   - **Expected**: 
     - First attempt fails
     - Retry succeeds
     - Product created successfully

### Success Criteria:
- ✅ Retry logic activates for network/server errors
- ✅ Exponential backoff delays visible
- ✅ Successful recovery on retry
- ✅ Clear error messages when retries exhausted

---

## Test Scenario 10: Multiple Options and Complex Variants

**Objective**: Test products with multiple options (e.g., Color + Size).

### Steps:

1. **Create Product with Multiple Options**
   - Add first option: `Color` with values: `Black`, `White`
   - Add second option: `Size` with values: `Small`, `Large`
   - Generate variants (should create 4 variants: Black/Small, Black/Large, White/Small, White/Large)

2. **Verify Variant Options Format**
   - Push to Medusa
   - **Check Payload**: Each variant should have:
     ```json
     {
       "options": {
         "{colorOptionId}": "Black",
         "{sizeOptionId}": "Small"
       }
     }
     ```
   - Both option IDs should be present as keys

3. **Verify All Variants Created**
   - Check Medusa admin or fetch product
   - **Expected**: All 4 variants exist with correct option combinations

### Success Criteria:
- ✅ Multiple options handled correctly
- ✅ All variant combinations created
- ✅ Variant options reference both option IDs
- ✅ No missing or duplicate variants

---

## Test Scenario 11: Update Product with New Variants

**Objective**: Test adding new variants to an existing product.

### Steps:

1. **Load Existing Product**
   - Use a product already in Medusa
   - Navigate to product details page

2. **Add New Variant**
   - In the UI, add a new variant (or modify existing)
   - Ensure variant has valid option values matching product options

3. **Push Update**
   - Click "Push to Medusa"
   - **Expected**: 
     - Product updated successfully
     - New variant added (if using product update endpoint)
     - Or use dedicated variant endpoint to add separately

4. **Verify in Medusa**
   - Check that new variant exists
   - Verify variant options are correct

### Success Criteria:
- ✅ New variants can be added to existing products
- ✅ Variant options format correct
- ✅ No conflicts with existing variants

---

## Test Scenario 12: Error Recovery and User Feedback

**Objective**: Verify error messages are user-friendly and actionable.

### Steps:

1. **Test Validation Error Display**
   - Create invalid product (missing title)
   - Try to push
   - **Expected**: 
     - Error shown in red box
     - Specific field mentioned: "Product must have a non-empty title"
     - Field path shown: `title`

2. **Test Medusa API Error Display**
   - Create product with invalid data that Medusa rejects
   - Try to push
   - **Expected**: 
     - Full error message from Medusa displayed
     - Error details expanded
     - Suggestion for resolution (if applicable)

3. **Test Network Error Display**
   - Disconnect internet or use invalid Medusa URL
   - Try to push
   - **Expected**: 
     - Network error message
     - Suggestion to check connection/URL

### Success Criteria:
- ✅ Error messages are clear and specific
- ✅ Field-level errors identify exact problem
- ✅ Suggestions provided when possible
- ✅ Error details accessible for debugging

---

## Test Scenario 13: Bulk Operations (Future)

**Objective**: Test bulk product operations (if import endpoint implemented).

### Steps:

1. **Prepare Multiple Products**
   - Create 2-3 products locally
   - Ensure all are valid

2. **Use Import Endpoint**
   - Send multiple products in single request
   - **Expected**: All products created/updated
   - **Verify**: Each product has correct structure

### Success Criteria:
- ✅ Bulk operations work correctly
- ✅ Partial failures handled gracefully
- ✅ Results indicate success/failure per product

---

## Test Scenario 14: Edge Cases

**Objective**: Test edge cases and boundary conditions.

### Steps:

1. **Empty Option Values**
   - Try to create option with no values
   - **Expected**: Validation error

2. **Duplicate Option Values**
   - Add same value twice to an option
   - **Expected**: Handled gracefully (deduplication or error)

3. **Very Long Option Names/Values**
   - Create option with very long name (100+ characters)
   - **Expected**: Handled correctly or validation error

4. **Special Characters in Option Values**
   - Use special characters: `!@#$%^&*()`
   - **Expected**: Handled correctly or sanitized

5. **Case Sensitivity**
   - Create option value "black" but variant uses "Black"
   - **Expected**: Case-insensitive matching or clear error

### Success Criteria:
- ✅ Edge cases handled gracefully
- ✅ Appropriate validation/errors for invalid data
- ✅ No crashes or unexpected behavior

---

## Test Scenario 15: Performance and Load

**Objective**: Verify performance with larger datasets.

### Steps:

1. **Product with Many Variants**
   - Create product with 3 options, 3 values each (27 variants)
   - Push to Medusa
   - **Expected**: 
     - Request completes in reasonable time
     - All variants created correctly
     - Two-phase creation may be slower but more reliable

2. **Multiple Concurrent Requests**
   - Push multiple products simultaneously
   - **Expected**: 
     - No race conditions
     - All requests complete successfully
     - Proper error handling if conflicts occur

### Success Criteria:
- ✅ Large variant sets handled correctly
- ✅ Performance acceptable for typical use cases
- ✅ No timeouts or memory issues

---

## Verification Checklist

After completing all test scenarios, verify:

- [ ] All critical bugs fixed (variant options format, option IDs)
- [ ] Two-phase creation works when appropriate
- [ ] Dedicated endpoints functional (options, variants)
- [ ] Error handling improved with clear messages
- [ ] Retry logic works for transient failures
- [ ] Payload sanitization handles edge cases
- [ ] Validation catches errors before API calls
- [ ] Response parsing extracts IDs correctly
- [ ] Type safety improved (TypeScript types)
- [ ] Code quality improved (centralized client, utilities)

---

## Common Issues and Troubleshooting

### Issue: "Expected type: 'object' for field 'variants, 0, options', got: 'array'"
**Solution**: Verify that `build-admin-product-payload.ts` uses object format for variant options. Check that option IDs are included in product-level options.

### Issue: "Option value X does not exist for option Y"
**Solution**: Ensure option values in variants exactly match (case-sensitive) values in product-level options. Check value validation logic.

### Issue: Two-phase creation not activating
**Solution**: Two-phase only activates when product has both options AND variants. Single-phase is used otherwise.

### Issue: Retry logic not working
**Solution**: Verify error is classified as retryable (network/server errors). Check `isRetryableError()` function.

### Issue: Variant IDs causing errors on create
**Solution**: Variant IDs should only be included for updates (`isUpdate: true`). For creates, IDs are omitted.

---

## Notes

- All API requests should be monitored in Browser DevTools Network tab
- Server-side logs should be checked for detailed error information
- Medusa admin panel can be used to verify final state
- Test with both development and production-like Medusa instances if possible
