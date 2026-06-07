import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PARENTING_KNOWLEDGE_DOCUMENTS } from '../_shared/parenting-knowledge.ts';

declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (
        input: string,
        options: { mean_pool: boolean; normalize: boolean },
      ) => Promise<number[] | Float32Array>;
    };
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function generateEmbedding(
  model: { run: (input: string, options: { mean_pool: boolean; normalize: boolean }) => Promise<number[] | Float32Array> },
  text: string,
): Promise<number[]> {
  const output = await model.run(text, { mean_pool: true, normalize: true });
  return Array.from(output);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const ingestSecret = Deno.env.get('INGEST_KNOWLEDGE_SECRET');
  if (!ingestSecret) {
    return jsonResponse({ error: 'INGEST_KNOWLEDGE_SECRET is missing' }, 500);
  }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== ingestSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase service configuration is missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const model = new Supabase.ai.Session('gte-small');
  const rows = [];

  for (const document of PARENTING_KNOWLEDGE_DOCUMENTS) {
    const embeddingInput = `${document.category}\n${document.title}\n${document.content}`;
    rows.push({
      ...document,
      embedding: await generateEmbedding(model, embeddingInput),
    });
  }

  const { error } = await supabase
    .from('parenting_knowledge_chunks')
    .upsert(rows, { onConflict: 'slug' });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({
    insertedOrUpdated: rows.length,
    model: 'gte-small',
  });
});
