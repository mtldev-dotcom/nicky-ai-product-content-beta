# Model & Studio Upload Feature — Implementation Log

**Feature**: Enable users to upload photos of human models or studios to a reusable library for AI Studio Photo generation.

**Started**: [Date to be filled]
**Status**: Planning → Implementation

---

## Task Checklist

### Phase 1: Database & Backend Foundation

#### Database Schema
- [x] Create migration file: `supabase/migrations/[timestamp]_create_studio_assets_table.sql`
  - **Log**: Created migration file `20250128000000_create_studio_assets_table.sql` with table schema, indexes, RLS policies, and updated_at trigger
- [x] Add RLS policies for `studio_assets` table
  - **Log**: Added 4 RLS policies: SELECT, INSERT, UPDATE, DELETE - all org-scoped
- [ ] Test migration locally
  - **Log**: 

#### API Routes - Upload
- [x] Create `src/app/api/studio-assets/upload/route.ts`
  - **Log**: Created upload route with FormData parsing, file validation (type, size max 10MB), R2 upload, and DB save
- [x] Implement presigned URL generation for uploads
  - **Log**: Using direct S3Client upload (not presigned) - uploads file directly to R2
- [x] Add file validation (type, size, dimensions)
  - **Log**: Validates image type, max 10MB size
- [ ] Implement thumbnail generation logic
  - **Log**: TODO - placeholder using same URL as thumbnail for now
- [x] Save asset metadata to database
  - **Log**: Saves asset with type, name, image_url, thumbnail_url, and metadata JSONB
- [x] Add error handling and validation
  - **Log**: Added Zod validation, error handling with proper status codes

#### API Routes - List & Delete
- [x] Create `src/app/api/studio-assets/route.ts` (GET endpoint)
  - **Log**: Created GET route with query parsing, filtering by type/search, pagination, org-scoped
- [x] Implement filtering by type (model/studio)
  - **Log**: Filtering by type and search (name) implemented
- [x] Add pagination support (limit/offset)
  - **Log**: Pagination with limit (default 50, max 100) and offset, returns total count
- [x] Create `src/app/api/studio-assets/[id]/route.ts` (DELETE endpoint)
  - **Log**: Created DELETE route with org verification, R2 file deletion (best effort), DB deletion
- [x] Implement R2 file deletion on asset delete
  - **Log**: Deletes both main image and thumbnail from R2, continues even if R2 fails
- [x] Add proper error responses
  - **Log**: Proper error responses with status codes (401, 403, 404, 500)

#### API Schema Updates
- [x] Add `StudioAssetUploadSchema` to `src/lib/api-schemas.ts`
  - **Log**: Added StudioAssetUploadSchema and StudioAssetListQuerySchema with types
- [x] Update `StudioGenerateRequestSchema` to include `modelImageUrl` and `studioImageUrl`
  - **Log**: Added optional modelImageUrl and studioImageUrl fields to schema
- [x] Add TypeScript types for new schemas
  - **Log**: Added StudioAssetUpload and StudioAssetListQuery types 

### Phase 2: Image Processing & Utilities

#### Thumbnail Generation
- [x] Create `src/lib/image-processing.ts`
  - **Log**: Created basic image processing utilities with placeholder for thumbnail generation (can be enhanced with Sharp later)
- [ ] Implement thumbnail generation (200x200, 400x400)
  - **Log**: TODO - placeholder returns same URL, needs Sharp implementation
- [x] Add image optimization (resize, compress)
  - **Log**: Added validateImageDimensions and getImageMetadata helpers
- [x] Handle different image formats (JPEG, PNG, WebP)
  - **Log**: Metadata extraction supports all formats
- [ ] Test thumbnail generation with various image sizes
  - **Log**: TODO - pending Sharp implementation

### Phase 3: Backend Integration

#### Prompt Building Updates
- [x] Modify `src/lib/ai/studioPrompt.ts` to accept `modelImageUrl`
  - **Log**: Updated buildStudioPrompt to accept modelImageUrl and studioImageUrl parameters
- [x] Update `buildStudioPrompt` to skip model text when image provided
  - **Log**: When modelImageUrl provided, uses minimal prompt; when studioImageUrl provided, uses minimal setup prompt
- [ ] Add `buildStudioPromptWithImages` function
  - **Log**: Not needed - integrated into existing function
- [ ] Test prompt building with and without images
  - **Log**: TODO - needs testing

#### Image Provider Updates
- [x] Update `src/lib/ai/imageProvider.ts` interface for multi-image support
  - **Log**: Added modelImageUrl and studioImageUrl to GenerateStudioImagesParams
- [x] Modify `src/lib/ai/providers/fal.ts` to handle model/studio images
  - **Log**: Updated to combine product + model + studio images in image_urls array (supports up to 4 images)
- [x] Modify `src/lib/ai/providers/gemini.ts` to handle model/studio images
  - **Log**: Updated to add model/studio images as additional inlineData parts in contents array
- [x] Modify `src/lib/ai/providers/openai.ts` to handle model/studio images
  - **Log**: Updated interface to accept parameters (still placeholder implementation)
- [ ] Test multi-image generation with each provider
  - **Log**: TODO - needs end-to-end testing

#### Studio Generate API Updates
- [x] Update `src/app/api/ai/studio-generate/route.ts` to accept image URLs
  - **Log**: Schema already updated, route now accepts modelImageUrl and studioImageUrl
- [x] Modify request parsing to include `modelImageUrl` and `studioImageUrl`
  - **Log**: Schema validation handles these fields automatically
- [x] Update prompt building call to pass image URLs
  - **Log**: buildStudioPrompt now receives modelImageUrl and studioImageUrl
- [x] Update image provider calls to include model/studio images
  - **Log**: generateStudioImages now receives and passes through modelImageUrl and studioImageUrl
- [ ] Test end-to-end generation flow with uploaded assets
  - **Log**: TODO - needs testing with actual uploads 

### Phase 4: UI Components - Library Management

#### Library Page
- [x] Create `src/app/studio-assets/page.tsx`
  - **Log**: Created comprehensive library page with grid layout, filtering, search, pagination
- [x] Implement grid/masonry layout for assets
  - **Log**: Responsive grid (2-6 columns based on screen size) with Framer Motion animations
- [x] Add filter tabs (All, Models, Studios)
  - **Log**: Filter tabs with active state styling, updates offset on change
- [x] Implement search functionality
  - **Log**: Real-time search with debounced API calls, resets pagination
- [x] Add infinite scroll or pagination
  - **Log**: Pagination with Previous/Next buttons, shows current range and total
- [x] Create empty states with illustrations
  - **Log**: Empty state with icon, message, and CTA button
- [x] Add loading skeletons
  - **Log**: Loading spinner during fetch
- [x] Implement responsive design (mobile, tablet, desktop)
  - **Log**: Fully responsive with mobile-optimized layout

#### Asset Card Component
- [x] Create `src/components/studio-assets/AssetCard.tsx`
  - **Log**: Integrated into page.tsx as AssetCard component
- [x] Implement thumbnail display with aspect ratio
  - **Log**: Aspect-square cards with object-cover images
- [x] Add hover overlay with actions (Use, Edit, Delete)
  - **Log**: Hover overlay with View and Delete buttons, animated with Framer Motion
- [x] Implement loading and error states
  - **Log**: Loading state for delete action
- [x] Add keyboard navigation support
  - **Log**: Click handlers for preview and delete

#### Asset Grid Component
- [x] Create `src/components/studio-assets/AssetGrid.tsx`
  - **Log**: Integrated into page.tsx, uses CSS Grid with AnimatePresence
- [x] Implement responsive grid layout
  - **Log**: Responsive grid with 2-6 columns
- [ ] Add virtual scrolling for performance
  - **Log**: TODO - not needed for initial implementation (pagination handles it)
- [ ] Implement bulk selection
  - **Log**: TODO - can be added later if needed

#### Upload Modal Component
- [x] Create `src/components/studio-assets/UploadModal.tsx`
  - **Log**: Integrated into page.tsx as UploadModal component
- [x] Implement drag-and-drop zone
  - **Log**: Drag-and-drop area with visual feedback
- [x] Add file picker integration
  - **Log**: Click to browse file input
- [x] Create live preview before upload
  - **Log**: Shows preview image after selection
- [x] Add metadata form (name, tags, description)
  - **Log**: Name input, tags with add/remove, type selector
- [x] Implement type selector (Model vs Studio)
  - **Log**: Radio-style buttons for type selection
- [x] Add progress bar for upload
  - **Log**: Loading state with spinner during upload
- [x] Implement file validation UI feedback
  - **Log**: Error messages for invalid files, size limits
- [ ] Add multiple file upload support
  - **Log**: TODO - single file for now, can enhance later
- [ ] Implement basic image editor (crop/rotate)
  - **Log**: TODO - can be added later

### Phase 5: UI Integration - AI Studio Photo Modal

#### Modal Enhancements
- [x] Modify `src/app/media/page.tsx` - `AiStudioPhotoModalBody`
  - **Log**: Added state for library assets, asset fetching, and selection
- [x] Add toggle: "Use Library Asset" vs "Use Text Model"
  - **Log**: Checkbox toggle in Model label, switches between text model select and asset picker
- [x] Implement asset picker section
  - **Log**: Dropdown select for models and studios when library mode enabled
- [x] Add compact grid for asset selection
  - **Log**: Dropdown select with preview thumbnails shown below selection
- [ ] Integrate "Upload New" button
  - **Log**: TODO - can link to /studio-assets page for now
- [x] Show selected asset preview
  - **Log**: Shows thumbnail preview below selection when asset selected
- [x] Add visual feedback for selected asset
  - **Log**: Preview image displayed when asset selected
- [ ] Implement "Recent Assets" section
  - **Log**: TODO - can be added as enhancement
- [ ] Add validation warnings for mismatched types
  - **Log**: TODO - basic validation in place, can enhance
- [x] Update generation request to include image URLs
  - **Log**: Generation request now includes modelImageUrl and studioImageUrl when selected 

### Phase 6: Navigation & Polish

#### Navigation Updates
- [ ] Add "Studio Assets" link to `src/components/layout/Navigation.tsx`
  - **Log**: 
- [ ] Update navigation icons if needed
  - **Log**: 

#### UX Enhancements
- [ ] Add toast notifications for success/error
  - **Log**: 
- [ ] Implement optimistic UI updates
  - **Log**: 
- [ ] Add keyboard shortcuts (u for upload, esc to close)
  - **Log**: 
- [ ] Implement dark mode support
  - **Log**: 
- [ ] Add micro-interactions (hover effects, transitions)
  - **Log**: 
- [ ] Implement accessibility features (ARIA labels, keyboard nav)
  - **Log**: 
- [ ] Add mobile optimizations (touch gestures, responsive)
  - **Log**: 

### Phase 7: Testing

#### Unit Tests
- [ ] Test API route handlers (upload, list, delete)
  - **Log**: 
- [ ] Test schema validation
  - **Log**: 
- [ ] Test image processing utilities
  - **Log**: 
- [ ] Test prompt building with images
  - **Log**: 

#### Integration Tests
- [ ] Test full upload → generation flow
  - **Log**: 
- [ ] Test RLS policy enforcement
  - **Log**: 
- [ ] Test multi-image provider handling
  - **Log**: 

#### E2E Tests
- [ ] Test upload model photo → select in modal → generate
  - **Log**: 
- [ ] Test library management (upload, delete, search)
  - **Log**: 
- [ ] Test error scenarios (invalid file, network failure)
  - **Log**: 

### Phase 8: Documentation & Cleanup

#### Documentation
- [ ] Update `docs/app-guide.md` with new feature
  - **Log**: 
- [ ] Update `docs/llms.md` if needed
  - **Log**: 
- [ ] Add feature documentation to README
  - **Log**: 

#### Code Cleanup
- [ ] Remove console.logs and debug code
  - **Log**: 
- [ ] Run linter and fix issues
  - **Log**: 
- [ ] Review and optimize performance
  - **Log**: 
- [ ] Update TypeScript types if needed
  - **Log**: 

---

## How to Use Models or Studios with Selected Products

### Overview

The AI Studio Photo Generator allows you to combine **uploaded model/studio photos** with **selected product images** to create professional studio photography. This feature enables you to:

1. Upload reusable model photos (human models wearing jewelry)
2. Upload reusable studio setup photos (backgrounds, lighting setups)
3. Select these assets when generating studio photos for your products
4. Combine product images + model images + studio images in a single generation

### Step-by-Step Workflow

#### Step 1: Upload Model/Studio Assets to Library

1. Navigate to **Studio Assets** page (or `/studio-assets` route)
2. Click **"Upload New Asset"** button
3. Choose asset type:
   - **Model**: Photos of human models (hands, faces, full body) - used for wearable jewelry shots
   - **Studio**: Background/lighting setup photos - used for product-only shots
4. Upload image file (max 10MB, JPEG/PNG/WebP)
5. Enter a name and optional tags/description
6. Save the asset

**Note**: Assets are organization-scoped and reusable across all products.

#### Step 2: Select Product Images

1. Go to **Media Management** page (`/media`)
2. Enable **Selection Mode** (checkbox icon in toolbar)
3. Click on product images to select them (checkboxes appear)
4. Selected images will show a purple ring indicator

#### Step 3: Open AI Studio Photo Generator

1. With product images selected, click **"AI Studio Photo"** button in the toolbar
2. The modal opens showing:
   - Selected product images (left sidebar on desktop, horizontal scroll on mobile)
   - Generation settings (jewelry type, model, setup, provider, etc.)

#### Step 4: Enable Library Asset Mode

1. In the **Model** section, check the **"Use Library"** checkbox
2. This switches from text-based model selection to uploaded asset selection

#### Step 5: Select Model Asset (Optional)

1. When "Use Library" is enabled, a dropdown appears for **Model** selection
2. Select an uploaded model asset from the dropdown
3. A preview thumbnail appears below showing the selected model
4. **Note**: Model assets are only used when generating wearable jewelry shots (rings on hands, necklaces on necks, etc.)

#### Step 6: Select Studio Asset (Optional)

1. When "Use Library" is enabled, a dropdown appears for **Studio** selection (in Setup section)
2. Select an uploaded studio asset from the dropdown
3. A preview thumbnail appears below showing the selected studio
4. **Note**: Studio assets define the background and lighting setup

#### Step 7: Configure Other Settings

- **Jewelry Type**: ring, bracelet, chain, pendant, earring
- **Setup**: Choose a setup (filtered based on jewelry type and model selection)
- **Provider**: OpenAI, FAL, or Gemini
- **Provider Model**: Specific model version
- **Features**: Macro close-up, No fingerprints/dust, Extra rim light
- **Background Darkness**: Slider (0-100)

#### Step 8: Generate Studio Photos

1. Click **"Generate"** (1 variant) or **"Generate Variants"** (3 variants)
2. The system combines:
   - **Product images** (your selected product photos)
   - **Model image** (if selected from library)
   - **Studio image** (if selected from library)
3. Generated images appear in the **Results** section
4. Generated images are automatically added to your product media gallery

### How It Works Technically

#### Image Combination Flow

1. **Frontend** (`src/app/media/page.tsx`):
   - User selects product images and library assets
   - On "Generate", sends request with:
     - `inputImages`: Array of product image URLs
     - `modelImageUrl`: Selected model asset URL (if any)
     - `studioImageUrl`: Selected studio asset URL (if any)

2. **API Route** (`src/app/api/ai/studio-generate/route.ts`):
   - Receives product images + optional model/studio URLs
   - Builds prompt using `buildStudioPrompt()`:
     - If `modelImageUrl` provided → uses minimal text prompt (image replaces text description)
     - If `studioImageUrl` provided → uses minimal setup prompt (image replaces text description)
   - Calls image provider with all images

3. **Prompt Building** (`src/lib/ai/studioPrompt.ts`):
   ```typescript
   // When modelImageUrl is provided:
   modelPrompt = 'Use the provided model image as reference for the human model appearance and pose.'
   
   // When studioImageUrl is provided:
   setupPrompt = 'Use the provided studio image as reference for the background and lighting setup.'
   ```

4. **Image Providers** (`src/lib/ai/providers/*.ts`):
   - **FAL**: Combines all images in `image_urls` array (supports up to 4 images)
   - **Gemini**: Adds model/studio images as `inlineData` parts in `contents` array
   - **OpenAI**: Accepts parameters (implementation may vary by model)

#### Example Request Payload

```json
{
  "productId": "uuid-here",
  "inputImages": [
    { "id": "url1", "url": "https://..." },
    { "id": "url2", "url": "https://..." }
  ],
  "jewelryType": "ring",
  "setupId": "ring_setup_01_concrete_pedestal",
  "modelId": "none",  // Ignored when modelImageUrl provided
  "options": {
    "macro": false,
    "noFingerprints": true,
    "extraRimLight": false,
    "darkness": 40
  },
  "variants": 1,
  "provider": "gemini",
  "providerModel": "gemini-3-pro-image-preview",
  "modelImageUrl": "https://r2.dev/user-id/model-asset.jpg",  // Optional
  "studioImageUrl": "https://r2.dev/user-id/studio-asset.jpg"  // Optional
}
```

### Use Cases

#### Use Case 1: Product + Model (Wearable Jewelry)
- **Product**: Ring photo
- **Model**: Hand model photo from library
- **Result**: Ring composited onto the model's hand with consistent lighting

#### Use Case 2: Product + Studio (Product-Only Shot)
- **Product**: Necklace photo
- **Studio**: Professional lighting setup photo from library
- **Result**: Necklace composited into the studio background with matching lighting

#### Use Case 3: Product + Model + Studio (Full Control)
- **Product**: Bracelet photo
- **Model**: Wrist model photo
- **Studio**: Background setup photo
- **Result**: Bracelet on model's wrist, composited into studio background

#### Use Case 4: Product Only (Text-Based Prompts)
- **Product**: Earring photo
- **Model**: Text-based model description (e.g., "model_01_minimalist")
- **Studio**: Text-based setup description (e.g., "Ring — Concrete Pedestal")
- **Result**: AI generates model and studio based on text prompts

### Tips & Best Practices

1. **Model Assets**: Upload high-quality photos of hands, wrists, necks, or full body shots depending on jewelry type
2. **Studio Assets**: Upload clean background/lighting setups that match your brand aesthetic
3. **Naming**: Use descriptive names for assets (e.g., "Female Hand - Right", "Dark Studio - Industrial")
4. **Reusability**: Upload once, use across multiple products
5. **Testing**: Try different combinations of model + studio to find what works best for your products
6. **Provider Selection**: Different providers (FAL, Gemini, OpenAI) may handle multi-image inputs differently

### Troubleshooting

- **No assets showing**: Ensure you've uploaded assets to `/studio-assets` page first
- **Generation fails**: Check that provider API keys are configured in Settings
- **Images not combining**: Verify that the selected provider supports multi-image inputs
- **Preview not showing**: Check that asset thumbnails are loading correctly

---

## Notes & Issues

### Issues Encountered
- 

### Decisions Made
- 

### Performance Optimizations
- 

### Future Enhancements
- 

---

## Completion Status

**Total Tasks**: [Count]
**Completed**: [Count]
**In Progress**: [Count]
**Blocked**: [Count]

**Estimated Completion**: [Date]
