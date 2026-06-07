CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS parenting_knowledge_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE parenting_knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read parenting knowledge chunks" ON parenting_knowledge_chunks;
CREATE POLICY "Anyone can read parenting knowledge chunks"
  ON parenting_knowledge_chunks FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_parenting_knowledge_category
  ON parenting_knowledge_chunks(category);

CREATE INDEX IF NOT EXISTS idx_parenting_knowledge_embedding_hnsw
  ON parenting_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION update_parenting_knowledge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_parenting_knowledge_updated_at ON parenting_knowledge_chunks;
CREATE TRIGGER set_parenting_knowledge_updated_at
  BEFORE UPDATE ON parenting_knowledge_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_parenting_knowledge_updated_at();

CREATE OR REPLACE FUNCTION match_parenting_knowledge(
  query_embedding vector(384),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.48
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  title TEXT,
  content TEXT,
  source TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pkc.id,
    pkc.category,
    pkc.title,
    pkc.content,
    pkc.source,
    1 - (pkc.embedding <=> query_embedding) AS similarity
  FROM parenting_knowledge_chunks pkc
  WHERE pkc.embedding IS NOT NULL
    AND 1 - (pkc.embedding <=> query_embedding) >= match_threshold
  ORDER BY pkc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_parenting_knowledge(vector, INT, FLOAT) TO anon, authenticated;
