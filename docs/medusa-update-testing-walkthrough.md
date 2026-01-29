# Medusa Product Update Testing Walkthrough

This document provides comprehensive testing scenarios for verifying the Medusa product update functionality, including ID reconciliation, change detection, and error handling.

## Prerequisites

- Medusa backend running and accessible
- Medusa API credentials configured in Settings
- Development environment running (`npm run dev`)
- Browser DevTools open (Network tab recommended)
- At least one product already created in Medusa (for update testing)

---

## Test Scenario 1: Simple Product Update (Title, Description)

**Objective**: Verify basic product field updates work correctly.

### Steps:

1. **Load Existing Product**
   - Navigate to dashboard
   - Find a product that exists in Medusa
   - Click "Edit" to load it into the editor

2. **Make Simple Changes**
   - Change product title: `Test Product - Updated Title`
   - Change description: `This is an updated description`
   - Save locally (auto-saves)

3. **Update in Medusa**
   - Click "Update in Medusa" button
   - Wait for success message

4. **Verify**
   - Check browser console for `[Update]` logs
   - Verify logs show:
     - Pre-flight fetch of current state
     - ID reconciliation (should show existing IDs)
     - Change detection (should show title/description changes)
     - Successful update
   - Verify in Medusa admin that product title and description are updated

### Expected Results:
- ✅ Update succeeds without errors
- ✅ Product title and description updated in Medusa
- ✅ No variant/option IDs lost
- ✅ Console logs show change detection

---

## Test Scenario 2: Update with Option Value Changes

**Objective**: Verify updating option values (adding/removing values) works correctly.

### Steps:

1. **Load Product with Options**
   - Load a product that has options (e.g., "Color" with values "Black", "Gold")

2. **Modify Option Values**
   - Add a new value: "Red" to the "Color" option
   - Remove an existing value: "Gold"
   - Save locally

3. **Update in Medusa**
   - Click "Update in Medusa"
   - Check console logs

4. **Verify**
   - Check console for change detection showing:
     - Option modified
     - Added values: "Red"
     - Removed values: "Gold"
   - Verify in Medusa that option now has "Black" and "Red" (not "Gold")

### Expected Results:
- ✅ Option values updated correctly
- ✅ Change detection identifies value changes
- ✅ No errors about invalid option values

---

## Test Scenario 3: Update with New Options Added

**Objective**: Verify adding new options to an existing product works.

### Steps:

1. **Load Product**
   - Load a product that has at least one option

2. **Add New Option**
   - Add a new option: "Size"
   - Add values: "S", "M", "L"
   - Save locally

3. **Update in Medusa**
   - Click "Update in Medusa"
   - Check console logs

4. **Verify**
   - Check console for change detection showing:
     - Option added: "Size"
   - Verify in Medusa that product now has both original option and new "Size" option
   - Verify new option has no ID in payload (Medusa will assign)

### Expected Results:
- ✅ New option added successfully
- ✅ Change detection identifies new option
- ✅ New option gets Medusa ID after update
- ✅ Existing options unchanged

---

## Test Scenario 4: Update with New Variants Added

**Objective**: Verify adding new variants to an existing product works.

### Steps:

1. **Load Product**
   - Load a product with existing variants

2. **Add New Variant**
   - Generate variants or manually add a new variant
   - Set variant title, SKU, price, and options
   - Save locally

3. **Update in Medusa**
   - Click "Update in Medusa"
   - Check console logs

4. **Verify**
   - Check console for change detection showing:
     - Variant added
   - Verify in Medusa that new variant exists
   - Verify new variant has no ID in payload (Medusa will assign)

### Expected Results:
- ✅ New variant added successfully
- ✅ Change detection identifies new variant
- ✅ New variant gets Medusa ID after update
- ✅ Existing variants unchanged

---

## Test Scenario 5: Update with Variant Option Changes

**Objective**: Verify changing variant options (e.g., changing Color from Black to Red) works.

### Steps:

1. **Load Product with Variants**
   - Load a product with variants that have options

2. **Modify Variant Options**
   - Find a variant with option "Color: Black"
   - Change it to "Color: Red" (assuming Red exists in option values)
   - Save locally

3. **Update in Medusa**
   - Click "Update in Medusa"
   - Check console logs

4. **Verify**
   - Check console for change detection showing:
     - Variant modified
     - Options changed
   - Verify in Medusa that variant now has "Color: Red"

### Expected Results:
- ✅ Variant options updated correctly
- ✅ Change detection identifies option changes
- ✅ Variant ID preserved (not treated as new variant)

---

## Test Scenario 6: Update with Option/Variant Removals

**Objective**: Verify that removed options/variants are handled (note: actual deletion requires DELETE endpoints).

### Steps:

1. **Load Product**
   - Load a product with multiple options and variants

2. **Remove Option/Variant Locally**
   - Remove one option from the product
   - Remove one variant from the product
   - Save locally

3. **Update in Medusa**
   - Click "Update in Medusa"
   - Check console logs

4. **Verify**
   - Check console for change detection showing:
     - Option removed
     - Variant removed
   - **Note**: Medusa update endpoint doesn't delete options/variants - they remain in Medusa
   - To actually delete, use DELETE endpoints separately

### Expected Results:
- ✅ Change detection identifies removals
- ✅ Update succeeds (but doesn't delete - that's expected)
- ✅ Removed items still exist in Medusa (use DELETE endpoints to remove)

---

## Test Scenario 7: Update with ID Mismatches (Error Handling)

**Objective**: Verify error handling when IDs don't match (should be prevented by reconciliation).

### Steps:

1. **Load Product**
   - Load a product from Medusa

2. **Manually Corrupt IDs** (for testing)
   - Open browser console
   - Manually set a variant ID to an invalid UUID: `useProductStore.getState().variants[0].id = "invalid-id"`
   - Try to update

3. **Verify Error Handling**
   - Update should fail with clear error message
   - Error should indicate invalid variant ID
   - Console should show validation error

### Expected Results:
- ✅ Validation catches invalid IDs before sending to Medusa
- ✅ Clear error message displayed
- ✅ No partial updates (transaction safety)

---

## Test Scenario 8: Update with Invalid Option Values (Error Handling)

**Objective**: Verify error handling when variant options reference invalid values.

### Steps:

1. **Load Product**
   - Load a product with options and variants

2. **Set Invalid Option Value**
   - Manually set a variant option to a value that doesn't exist:
     - `useProductStore.getState().variants[0].options["Color"] = "InvalidColor"`
   - Try to update

3. **Verify Error Handling**
   - Update should fail with validation error
   - Error should indicate which option value is invalid
   - Should suggest valid values

### Expected Results:
- ✅ Validation catches invalid option values
- ✅ Clear error message with valid values listed
- ✅ No update sent to Medusa

---

## Test Scenario 9: Partial Update (Only Some Fields)

**Objective**: Verify that updating only some fields (not all) works correctly.

### Steps:

1. **Load Product**
   - Load a product with full data (title, description, options, variants)

2. **Update Only Title**
   - Change only the title
   - Leave everything else unchanged
   - Save and update

3. **Verify**
   - Check console logs - should show only title change
   - Verify in Medusa that only title changed
   - Verify all other fields unchanged

### Expected Results:
- ✅ Only changed fields are updated
- ✅ Unchanged fields remain as-is
- ✅ Change detection shows only title change

---

## Test Scenario 10: Full Product Replacement Update

**Objective**: Verify updating all fields at once works correctly.

### Steps:

1. **Load Product**
   - Load an existing product

2. **Change Everything**
   - Update title, description, subtitle
   - Modify all option values
   - Modify all variant prices
   - Change variant options
   - Save locally

3. **Update in Medusa**
   - Click "Update in Medusa"
   - Check console logs

4. **Verify**
   - Check console for comprehensive change detection
   - Verify all changes reflected in Medusa
   - Verify all IDs preserved correctly

### Expected Results:
- ✅ All changes applied successfully
- ✅ Change detection shows all modifications
- ✅ No data loss or ID mismatches

---

## Test Scenario 11: Update Product with Complex Option/Variant Structure

**Objective**: Verify updates work with complex product structures (multiple options, many variants).

### Steps:

1. **Load Complex Product**
   - Load a product with:
     - 3+ options (e.g., Color, Size, Material)
     - 10+ variants (all combinations)

2. **Make Changes**
   - Add a new option value to one option
   - Modify prices for several variants
   - Change options for a few variants
   - Save and update

3. **Verify**
   - Check console logs for reconciliation of all IDs
   - Verify all changes applied correctly
   - Verify no variants lost or corrupted

### Expected Results:
- ✅ Complex updates handled correctly
- ✅ All IDs reconciled properly
- ✅ No performance issues or timeouts

---

## Test Scenario 12: Update After Concurrent Modification

**Objective**: Verify handling when product was modified in Medusa between load and update.

### Steps:

1. **Load Product**
   - Load a product in the editor

2. **Modify in Medusa Admin** (separate browser/tab)
   - Go to Medusa admin
   - Change the product title directly in Medusa

3. **Update from Editor**
   - Make a different change in the editor
   - Try to update

4. **Verify**
   - Update should succeed (pre-flight fetch gets latest state)
   - Reconciliation should handle the concurrent changes
   - Both changes should be reflected (or editor change should win)

### Expected Results:
- ✅ Pre-flight fetch gets latest state
- ✅ Update succeeds despite concurrent changes
- ✅ No conflicts or data loss

---

## Test Scenario 13: Update with Missing Medusa IDs (New Product Loaded)

**Objective**: Verify handling when product was loaded without Medusa IDs (edge case).

### Steps:

1. **Create Local Product** (not from Medusa)
   - Create a new product locally
   - Add options and variants
   - Push to Medusa (creates it)

2. **Load and Update**
   - Load the newly created product
   - Make changes
   - Update

3. **Verify**
   - Check console for ID reconciliation
   - Should find Medusa IDs by matching (SKU, option titles, etc.)
   - Update should succeed

### Expected Results:
- ✅ ID reconciliation finds Medusa IDs by matching
- ✅ Update succeeds even without initial Medusa IDs
- ✅ IDs preserved for future updates

---

## Test Scenario 14: Update with Network Errors (Retry Logic)

**Objective**: Verify retry logic handles transient network failures.

### Steps:

1. **Load Product**
   - Load a product for update

2. **Simulate Network Issue**
   - Use browser DevTools to throttle network to "Offline"
   - Try to update
   - Re-enable network

3. **Verify**
   - Should retry automatically
   - Should eventually succeed when network restored
   - Check console for retry attempts

### Expected Results:
- ✅ Retry logic activates on network errors
- ✅ Update succeeds after network restored
- ✅ Clear error messages if all retries fail

---

## Test Scenario 15: Update Validation - Invalid Payload

**Objective**: Verify validation catches invalid payloads before sending to Medusa.

### Steps:

1. **Load Product**
   - Load a product

2. **Corrupt Payload** (via console)
   - Manually corrupt the product state:
     - Remove required field (title)
     - Set invalid variant price (negative number)
     - Set invalid option value type

3. **Try to Update**
   - Attempt update
   - Check for validation errors

### Expected Results:
- ✅ Validation catches errors before API call
- ✅ Clear error messages for each validation failure
- ✅ No invalid data sent to Medusa

---

## Debugging Tips

### Console Logs to Watch For

1. **`[Update] Starting product update`**: Update flow initiated
2. **`[Update] Fetching current Medusa product state`**: Pre-flight fetch
3. **`[Update] Reconciling IDs`**: ID mapping in progress
4. **`[Update] Detecting changes`**: Change detection running
5. **`[Update] Building update payload`**: Payload construction
6. **`[Update] Validating payload`**: Validation running
7. **`[Update] Sending update request`**: API call initiated
8. **`[Update] Update successful`**: Success confirmation

### Common Issues

1. **"Option ID not found"**
   - **Cause**: Option ID doesn't exist in Medusa
   - **Fix**: Reconciliation should handle this, but check if option was deleted in Medusa

2. **"Variant ID not found"**
   - **Cause**: Variant ID doesn't exist in Medusa
   - **Fix**: Reconciliation should handle this, but check if variant was deleted

3. **"Option value does not exist"**
   - **Cause**: Variant option value doesn't match any option values
   - **Fix**: Ensure option value exists in product-level options

4. **"Payload validation failed"**
   - **Cause**: Payload structure invalid
   - **Fix**: Check console for specific validation error

### Network Tab Inspection

1. **Pre-flight GET**: Should see GET request to `/admin/products/:id`
2. **Update POST**: Should see POST request to `/admin/products/:id`
3. **Request Payload**: Inspect the payload structure
   - Options should have IDs for existing options
   - Variants should have IDs for existing variants
   - Variant options should use option IDs as keys

---

## Success Criteria

All test scenarios should:
- ✅ Complete without errors
- ✅ Show appropriate console logs
- ✅ Reflect changes in Medusa correctly
- ✅ Preserve all IDs correctly
- ✅ Handle errors gracefully with clear messages

---

## Next Steps

After completing all test scenarios:
1. Review any failures and check console logs
2. Verify all edge cases handled
3. Test with real production data (if available)
4. Document any issues found for future fixes
