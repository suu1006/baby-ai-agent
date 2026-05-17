INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diary-photos',
  'diary-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload their own profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own profile photos" ON storage.objects;

CREATE POLICY "Users can upload their own profile photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'diary-photos'
    AND (storage.foldername(name))[1] = 'child-profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can update their own profile photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND (storage.foldername(name))[1] = 'child-profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'diary-photos'
    AND (storage.foldername(name))[1] = 'child-profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own profile photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND (storage.foldername(name))[1] = 'child-profiles'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
