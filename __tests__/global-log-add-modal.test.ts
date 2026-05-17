import fs from 'fs';
import path from 'path';

describe('GlobalLogAddModal', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../components/GlobalLogAddModal.tsx'),
    'utf8',
  );

  it('provides the same log type choices as the logs screen add picker', () => {
    expect(source).toContain('어떤 기록을 추가할까요?');
    expect(source).toContain('수유');
    expect(source).toContain('수면');
    expect(source).toContain('기저귀');
    expect(source).toContain('투약');
    expect(source).toContain('체온');
    expect(source).toContain('병원');
    expect(source).toContain('증상');
  });

  it('saves records without navigating away from the current tab', () => {
    expect(source).toContain("supabase.from('feeding_logs').insert");
    expect(source).toContain("supabase.from('sleep_logs').insert");
    expect(source).toContain("supabase.from('diaper_logs').insert");
    expect(source).toContain("supabase.from('health_logs').insert");
    expect(source).not.toContain('router.push');
  });

  it('moves above the keyboard and uses the shorter save label', () => {
    expect(source).toContain('KeyboardAvoidingView');
    expect(source).toContain('behavior="height"');
    expect(source).toContain('keyboardVisible && styles.backdropKeyboardVisible');
    expect(source).toContain('paddingBottom: 15');
    expect(source).toContain("saving ? '저장 중...' : '저장'");
    expect(source).not.toContain("saving ? '저장 중...' : '저장하기'");
  });
});
