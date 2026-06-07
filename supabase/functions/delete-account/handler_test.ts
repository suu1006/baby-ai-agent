import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createDeleteAccountHandler } from './handler.ts';

function createUserClientStub(user: { id: string } | null) {
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error: user ? null : { message: 'Unauthorized' },
      }),
    },
  };
}

function createAdminClientStub(input?: {
  listError?: { message: string };
  removeError?: { message: string };
  deleteError?: { message: string };
  files?: Array<{ name: string }>;
}) {
  const removedPaths: string[] = [];
  let deletedUserId: string | null = null;

  return {
    removedPaths,
    get deletedUserId() {
      return deletedUserId;
    },
    storage: {
      from: (_bucket: string) => ({
        list: async () => ({
          data: input?.files ?? [{ name: 'child-1.jpg' }, { name: 'child-2.png' }],
          error: input?.listError ?? null,
        }),
        remove: async (paths: string[]) => {
          removedPaths.push(...paths);
          return { error: input?.removeError ?? null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (userId: string) => {
          deletedUserId = userId;
          return { error: input?.deleteError ?? null };
        },
      },
    },
  };
}

Deno.test('delete-account rejects missing Authorization header', async () => {
  const admin = createAdminClientStub();
  const handler = createDeleteAccountHandler({
    createUserClient: () => createUserClientStub(null) as never,
    createAdminClient: () => admin as never,
  });

  const response = await handler(new Request('https://example.com/delete-account', { method: 'POST' }));

  assertEquals(response.status, 401);
});

Deno.test('delete-account removes profile photos before deleting auth user', async () => {
  const admin = createAdminClientStub();
  const handler = createDeleteAccountHandler({
    createUserClient: () => createUserClientStub({ id: 'user-1' }) as never,
    createAdminClient: () => admin as never,
  });

  const response = await handler(new Request('https://example.com/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { deleted: true });
  assertEquals(admin.removedPaths, [
    'child-profiles/user-1/child-1.jpg',
    'child-profiles/user-1/child-2.png',
  ]);
  assertEquals(admin.deletedUserId, 'user-1');
});

Deno.test('delete-account reports admin deletion failures', async () => {
  const admin = createAdminClientStub({ deleteError: { message: 'storage owner remains' } });
  const handler = createDeleteAccountHandler({
    createUserClient: () => createUserClientStub({ id: 'user-1' }) as never,
    createAdminClient: () => admin as never,
  });

  const response = await handler(new Request('https://example.com/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
  }));

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: 'storage owner remains' });
});
