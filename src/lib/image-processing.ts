/**
 * Image processing utilities for generating thumbnails and optimizing images.
 * 
 * Note: For production, consider using Sharp (npm install sharp) for better
 * performance and more features. This implementation provides a basic structure
 * that can be enhanced.
 */

/**
 * Generate a thumbnail URL from an image URL.
 * 
 * For now, returns the same URL. In production, this should:
 * 1. Download the image
 * 2. Resize to thumbnail dimensions (e.g., 400x400)
 * 3. Upload to R2 with _thumb suffix
 * 4. Return the thumbnail URL
 * 
 * @param imageUrl - The original image URL
 * @param width - Thumbnail width (default: 400)
 * @param height - Thumbnail height (default: 400)
 * @returns Promise resolving to thumbnail URL
 */
export async function generateThumbnailUrl(
  imageUrl: string,
  width: number = 400,
  height: number = 400
): Promise<string> {
  // TODO: Implement actual thumbnail generation
  // For now, return the original URL
  // In production, use Sharp or similar library to:
  // 1. Fetch image from URL
  // 2. Resize maintaining aspect ratio
  // 3. Upload to R2 with _thumb suffix
  // 4. Return new URL
  
  return imageUrl;
}

/**
 * Validate image dimensions and suggest optimal sizes.
 * 
 * @param file - The image file
 * @returns Object with validation result and suggestions
 */
export async function validateImageDimensions(file: File): Promise<{
  valid: boolean;
  width?: number;
  height?: number;
  suggestedWidth?: number;
  suggestedHeight?: number;
  message?: string;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      
      // Suggest optimal dimensions (minimum 512x512 for good quality)
      const suggestedWidth = Math.max(512, width);
      const suggestedHeight = Math.max(512, height);
      
      resolve({
        valid: true,
        width,
        height,
        suggestedWidth,
        suggestedHeight,
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        valid: false,
        message: 'Failed to load image',
      });
    };
    
    img.src = url;
  });
}

/**
 * Get image metadata (dimensions, file size, type).
 * 
 * @param file - The image file
 * @returns Promise resolving to image metadata
 */
export async function getImageMetadata(file: File): Promise<{
  width: number;
  height: number;
  size: number;
  type: string;
  aspectRatio: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.width,
        height: img.height,
        size: file.size,
        type: file.type,
        aspectRatio: img.width / img.height,
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}
