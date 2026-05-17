import fs from 'fs';
import path from 'path';

describe('profile photo upload flow', () => {
  it('uploads image picker base64 data as an ArrayBuffer for React Native Supabase storage', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../lib/profilePhoto.ts'),
      'utf8',
    );

    expect(source).toContain('export function base64ToArrayBuffer');
    expect(source).toContain('uploadChildProfilePhoto');
    expect(source).toContain('asset.base64');
    expect(source).toContain('.upload(fileName, fileBody, {');
    expect(source).toContain("getPublicUrl(fileName)");
  });

  it('makes onboarding request base64 data and refuses silent photo upload failure', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/onboarding.tsx'),
      'utf8',
    );

    expect(source).toContain("import { uploadChildProfilePhoto } from '../lib/profilePhoto';");
    expect(source).toContain('const [photoAsset, setPhotoAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);');
    expect(source).toContain('base64: true');
    expect(source).toContain('photoUrl = await uploadChildProfilePhoto({');
    expect(source).toContain("Alert.alert('사진 업로드 오류'");
    expect(source).not.toContain('response.blob()');
  });

  it('configures the Supabase storage bucket as public for profile photo URLs', () => {
    const migrationsDir = path.join(__dirname, '../supabase/migrations');
    const migration = fs
      .readdirSync(migrationsDir)
      .find((fileName) => fileName.endsWith('_profile_photo_storage.sql'));

    expect(migration).toBeTruthy();

    const source = fs.readFileSync(path.join(migrationsDir, migration!), 'utf8');

    expect(source).toContain("INSERT INTO storage.buckets");
    expect(source).toContain("'diary-photos'");
    expect(source).toContain('public = true');
    expect(source).toContain('"Users can upload their own profile photos"');
    expect(source).toContain('(storage.foldername(name))[2] = auth.uid()::text');
  });
});
