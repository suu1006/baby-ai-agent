import fs from 'fs';
import path from 'path';

describe('ChatScreen layout and state behavior', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../app/(tabs)/chat.tsx'),
    'utf8',
  );

  it('does not reset the current chat whenever the tab receives focus', () => {
    expect(source).not.toContain('useFocusEffect');
  });

  it('shows a new chat button beside the history button', () => {
    expect(source).toContain('style={styles.headerActions}');
    expect(source).toContain('accessibilityLabel="새 대화 시작"');
    expect(source).toContain('name="add"');
  });

  it('only resets the current chat from the new chat action', () => {
    expect(source).toContain('onPress={startNewChat}');
  });
});
