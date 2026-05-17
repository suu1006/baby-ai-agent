import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from './supabase';

const PROFILE_PHOTO_BUCKET = 'diary-photos';

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function getPhotoExtension(asset: ImagePickerAsset): string {
  const fromFileName = asset.fileName?.split('.').pop();
  const fromUri = asset.uri.split('?')[0].split('.').pop();
  const extension = (fromFileName || fromUri || 'jpg').toLowerCase();

  if (extension === 'jpeg') return 'jpg';
  return extension.replace(/[^a-z0-9]/g, '') || 'jpg';
}

function getContentType(asset: ImagePickerAsset, extension: string): string {
  if (asset.mimeType) return asset.mimeType;
  return extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
}

export async function uploadChildProfilePhoto({
  userId,
  childId,
  asset,
}: {
  userId: string;
  childId?: string;
  asset: ImagePickerAsset;
}): Promise<string> {
  if (!asset.base64) {
    throw new Error('이미지 데이터를 읽을 수 없습니다. 다시 선택해주세요.');
  }

  const extension = getPhotoExtension(asset);
  const fileBody = base64ToArrayBuffer(asset.base64);
  const fileName = `child-profiles/${userId}/${childId ?? 'new'}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(fileName, fileBody, {
      contentType: getContentType(asset, extension),
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}
