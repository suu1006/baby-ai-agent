DROP POLICY IF EXISTS "Users can delete chat messages for their children" ON chat_messages;

CREATE POLICY "Users can delete chat messages for their children"
  ON chat_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM children
      WHERE children.id = chat_messages.child_id
      AND children.user_id = auth.uid()
    )
  );
