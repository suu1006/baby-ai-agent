import fs from 'fs';
import path from 'path';

describe('HomeScreen layout', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../app/(tabs)/index.tsx'),
    'utf8',
  );

  it('uses separated summary tiles instead of one enclosing summary card', () => {
    expect(source).toContain('style={styles.summaryGrid}');
    expect(source).toContain('style={styles.summaryTile}');
    expect(source).not.toContain('style={styles.summaryCard}');
  });

  it('exposes the timeline directly instead of wrapping it in a card shell', () => {
    expect(source).toContain('style={styles.timelineSection}');
    expect(source).not.toContain('style={styles.timelineCard}');
  });

  it('does not render quick action shortcuts under the baby profile', () => {
    expect(source).not.toContain('style={styles.quickActionRow}');
    expect(source).not.toContain('style={styles.quickAction}');
  });

  it('shows AI coaching as text without the right-side character image', () => {
    expect(source).toContain('style={styles.aiTextBox}');
    expect(source).not.toContain('style={styles.aiCoachImage}');
    expect(source).not.toContain("require('../../assets/coach.png')");
  });

  it('uses calendar and settings icon actions in the baby profile header', () => {
    expect(source).toContain('style={styles.profileActions}');
    expect(source).toContain('name="calendar-outline"');
    expect(source).toContain('name="settings-outline"');
    expect(source).not.toContain('<Text style={styles.badgeText}>오늘</Text>');
  });

  it('opens AI coaching detail with the full baby status check prompt', () => {
    expect(source).toContain(
      '오늘 내 아기의 전체적인 상태를 체크해주고 필요한 부분 조언해줘',
    );
  });

  it('does not render the next nap prediction row in the summary section', () => {
    expect(source).not.toContain('style={styles.summaryNapRow}');
    expect(source).not.toContain('다음 낮잠 예상');
  });
});
