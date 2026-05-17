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

  it('uses gray consultation backgrounds with a darker header', () => {
    expect(source).toContain("backgroundColor: '#F6F7F9'");
    expect(source).toContain("backgroundColor: '#EEF0F3'");
    expect(source).not.toContain("backgroundColor: '#FFF1F5'");
    expect(source).toMatch(/messageList:\s*{[\s\S]*backgroundColor: '#F6F7F9'/);
    expect(source).toMatch(/header:\s*{[\s\S]*backgroundColor: '#EEF0F3'/);
  });

  it('collapses long history answers behind a toggle', () => {
    expect(source).toContain('expandedHistoryAnswers');
    expect(source).toContain('expandableHistoryAnswers');
    expect(source).toContain('nativeEvent.lines.length > 1');
    expect(source).toContain('const shouldCollapseAnswer = isAnswerExpandable && !isAnswerExpanded;');
    expect(source).toContain('numberOfLines={shouldCollapseAnswer ? 1 : undefined}');
    expect(source).toContain('{isAnswerExpandable && (');
    expect(source).toContain('전체 보기');
    expect(source).toContain('접기');
  });

  it('uses dark gray text for default quick questions', () => {
    expect(source).toMatch(/quickQuestionText:\s*{\s*fontSize: 14,\s*color: Colors\.text,/);
  });
});
