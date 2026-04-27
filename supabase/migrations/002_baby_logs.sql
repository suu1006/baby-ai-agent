-- Feeding logs table
CREATE TABLE IF NOT EXISTS feeding_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  fed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_ml INTEGER,
  type TEXT NOT NULL CHECK (type IN ('breast', 'formula', 'mixed', 'solid')),
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sleep logs table
CREATE TABLE IF NOT EXISTS sleep_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER / 60
      ELSE NULL
    END
  ) STORED,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Diaper logs table
CREATE TABLE IF NOT EXISTS diaper_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN ('wet', 'dirty', 'both', 'dry')),
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE feeding_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diaper_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for feeding_logs
DROP POLICY IF EXISTS "Users can view feeding logs for their children" ON feeding_logs;
DROP POLICY IF EXISTS "Users can insert feeding logs for their children" ON feeding_logs;
DROP POLICY IF EXISTS "Users can update feeding logs for their children" ON feeding_logs;
DROP POLICY IF EXISTS "Users can delete feeding logs for their children" ON feeding_logs;

CREATE POLICY "Users can view feeding logs for their children"
  ON feeding_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = feeding_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert feeding logs for their children"
  ON feeding_logs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM children WHERE children.id = feeding_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update feeding logs for their children"
  ON feeding_logs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = feeding_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete feeding logs for their children"
  ON feeding_logs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = feeding_logs.child_id AND children.user_id = auth.uid())
  );

-- RLS Policies for sleep_logs
DROP POLICY IF EXISTS "Users can view sleep logs for their children" ON sleep_logs;
DROP POLICY IF EXISTS "Users can insert sleep logs for their children" ON sleep_logs;
DROP POLICY IF EXISTS "Users can update sleep logs for their children" ON sleep_logs;
DROP POLICY IF EXISTS "Users can delete sleep logs for their children" ON sleep_logs;

CREATE POLICY "Users can view sleep logs for their children"
  ON sleep_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = sleep_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert sleep logs for their children"
  ON sleep_logs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM children WHERE children.id = sleep_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update sleep logs for their children"
  ON sleep_logs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = sleep_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete sleep logs for their children"
  ON sleep_logs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = sleep_logs.child_id AND children.user_id = auth.uid())
  );

-- RLS Policies for diaper_logs
DROP POLICY IF EXISTS "Users can view diaper logs for their children" ON diaper_logs;
DROP POLICY IF EXISTS "Users can insert diaper logs for their children" ON diaper_logs;
DROP POLICY IF EXISTS "Users can update diaper logs for their children" ON diaper_logs;
DROP POLICY IF EXISTS "Users can delete diaper logs for their children" ON diaper_logs;

CREATE POLICY "Users can view diaper logs for their children"
  ON diaper_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = diaper_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can insert diaper logs for their children"
  ON diaper_logs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM children WHERE children.id = diaper_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can update diaper logs for their children"
  ON diaper_logs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = diaper_logs.child_id AND children.user_id = auth.uid())
  );
CREATE POLICY "Users can delete diaper logs for their children"
  ON diaper_logs FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM children WHERE children.id = diaper_logs.child_id AND children.user_id = auth.uid())
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feeding_logs_child_time ON feeding_logs(child_id, fed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_child_time ON sleep_logs(child_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_diaper_logs_child_time ON diaper_logs(child_id, changed_at DESC);
