import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROFILE_PHOTO_BUCKET = 'diary-photos';
const PROFILE_PHOTO_ROOT = 'child-profiles';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type DeleteAccountDeps = {
  createUserClient: (authHeader: string) => SupabaseClient;
  createAdminClient: () => SupabaseClient;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function removeProfilePhotos(adminClient: SupabaseClient, userId: string) {
  const folder = `${PROFILE_PHOTO_ROOT}/${userId}`;
  const { data, error } = await adminClient.storage
    .from(PROFILE_PHOTO_BUCKET)
    .list(folder);

  if (error) throw new Error(error.message);

  const paths = (data ?? [])
    .filter((item) => item.name)
    .map((item) => `${folder}/${item.name}`);

  if (paths.length === 0) return;

  const { error: removeError } = await adminClient.storage
    .from(PROFILE_PHOTO_BUCKET)
    .remove(paths);

  if (removeError) throw new Error(removeError.message);
}

export function createDeleteAccountHandler(deps: DeleteAccountDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const userClient = deps.createUserClient(authHeader);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const adminClient = deps.createAdminClient();

    try {
      await removeProfilePhotos(adminClient, user.id);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
      if (deleteError) throw new Error(deleteError.message);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Account deletion failed';
      return jsonResponse({ error: message }, 500);
    }

    return jsonResponse({ deleted: true });
  };
}
