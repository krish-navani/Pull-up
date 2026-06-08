import { readAsStringAsync } from 'expo-file-system/legacy';

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dednna8sw';
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'pullup_driver_license';

/**
 * Upload image to Cloudinary
 * @param imageUri - Local file URI from image picker
 * @param folder - Folder name in Cloudinary (e.g., 'driver_licenses')
 */
export const uploadImageToCloudinary = async (
  imageUri: string,
  folder: string = 'driver_licenses'
): Promise<string> => {
  try {
    console.log('[CLOUDINARY] Starting upload for:', imageUri);
    
    // Read the image file as base64 using the legacy API
    const base64 = await readAsStringAsync(imageUri, {
      encoding: 'base64',
    });

    console.log('[CLOUDINARY] Image read as base64, size:', base64.length);

    // Prepare form data using native FormData
    const formData = new FormData();
    formData.append('file', `data:image/jpeg;base64,${base64}`);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);
    formData.append('resource_type', 'auto');

    console.log('[CLOUDINARY] Uploading to:', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    console.log('[CLOUDINARY] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[CLOUDINARY] Error response:', errorData);
      throw new Error(
        errorData.error?.message || `Upload failed with status ${response.status}`
      );
    }

    const data = await response.json();
    console.log('[CLOUDINARY] Upload success, URL:', data.secure_url);
    return data.secure_url;
  } catch (error: any) {
    console.error('[CLOUDINARY] Upload error:', error);
    throw {
      code: 'CLOUDINARY_UPLOAD_ERROR',
      message: error.message || 'Failed to upload image',
    };
  }
};

/**
 * Delete image from Cloudinary
 * @param publicId - The public ID of the image in Cloudinary
 */
export const deleteImageFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    // Note: This works only with authenticated requests (needs API key/secret)
    // For now, we'll just log it - you can implement full deletion with backend support
    console.log('[CLOUDINARY] Image deletion would require backend authentication');
  } catch (error: any) {
    console.error('[CLOUDINARY] Failed to delete image:', error);
  }
};
