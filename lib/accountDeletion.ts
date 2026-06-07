import { supabase } from './supabase';

export async function deleteCurrentAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) {
    throw new Error(error.message || '계정 삭제에 실패했습니다.');
  }

  await supabase.auth.signOut({ scope: 'local' });
}
