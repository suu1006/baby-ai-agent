-- Health logs table
CREATE TABLE IF NOT EXISTS health_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN ('medication', 'temperature', 'hospital', 'symptom')),
  title TEXT NOT NULL,
  value TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE health_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for health_logs
DROP POLICY IF EXISTS "Users can view health logs for their children" ON health_logs;
DROP POLICY IF EXISTS "Users can insert health logs for their children" ON health_logs;
DROP POLICY IF EXISTS "Users can update health logs for their children" ON health_logs;
DROP POLICY IF EXISTS "Users can delete health logs for their children" ON health_logs;

CREATE POLICY "Users can view health logs for their children"
  ON health_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = health_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert health logs for their children"
  ON health_logs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM children WHERE children.id = health_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update health logs for their children"
  ON health_logs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = health_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete health logs for their children"
  ON health_logs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = health_logs.child_id AND children.user_id = auth.uid())
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_health_logs_child_time ON health_logs(child_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_logs_child_type_time ON health_logs(child_id, type, recorded_at DESC);
