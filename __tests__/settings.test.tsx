import fs from 'fs';
import path from 'path';

describe('SettingsScreen', () => {
  it('does not reserve the bottom safe area above the tab bar', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain(
      "<SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>",
    );
  });
});
