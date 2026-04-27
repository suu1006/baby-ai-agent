-- Children table
CREATE TABLE IF NOT EXISTS children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birthdate DATE NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for children
CREATE POLICY "Users can view their own children"
  ON children FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own children"
  ON children FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own children"
  ON children FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own children"
  ON children FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for chat_messages
CREATE POLICY "Users can view chat messages for their children"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children
      WHERE children.id = chat_messages.child_id
      AND children.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chat messages for their children"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM children
      WHERE children.id = chat_messages.child_id
      AND children.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_children_user_id ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_child_created ON chat_messages(child_id, created_at DESC);
