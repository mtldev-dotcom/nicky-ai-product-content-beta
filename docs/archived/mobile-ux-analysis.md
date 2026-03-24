# Mobile UX Analysis - Current State & Target Improvements

## Current Pain Points (Mobile-First)

### 1. Create Entry Confusion
- **Problem**:** Three entry points for creation:
  - Dashboard (`/`) - quick prompt + image
  - `/create` - card chooser that routes "Image+Text" and "JSON" back to `/`
  - `/create/drop-it` - full ingest flow
- **Impact**: Users don't know which to use; "Image+Text" card is misleading (routes to dashboard, not a dedicated flow)

### 2. Draft/History Discovery
- **Problem**: Dashboard table is desktop-first; hard to scan on mobile
- **Impact**: Users can't quickly resume work or find templates

### 3. Export/JSON Page
- **Problem**: Large JSON blocks render fully; no mobile-optimized actions
- **Impact**: Copy/download actions are buried; performance issues on mobile

### 4. Performance Issues
- Heavy route animations on every navigation
- Large base64 images in memory (Dashboard image selection)
- No reduced-motion support

## Target Improvements (Acceptance Criteria)

### Unified Create Flow
- ✅ Single entry point: `/create` with all input types
- ✅ Smart routing: fast path (prompt+1 image) vs ingest path (mixed sources)
- ✅ Mobile-first: sticky bottom CTA, progressive disclosure
- ✅ Clear next steps after generation

### Draft Library (Mobile)
- ✅ Card-based layout (not table)
- ✅ Search + filters (Draft/Template/Published)
- ✅ Touch-friendly resume actions

### Export Page (Mobile)
- ✅ Sticky action bar (Copy/Download)
- ✅ Collapsible JSON (collapsed by default on mobile)
- ✅ Health checks visible without scrolling

### Performance
- ✅ Reduced motion support
- ✅ Optimized image handling (no large base64 in state)
- ✅ Lighter route transitions on mobile

