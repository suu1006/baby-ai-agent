import fs from 'fs';
import path from 'path';

describe('TabsLayout', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../app/(tabs)/_layout.tsx'),
    'utf8',
  );

  it('renders a centered add button that opens the log add picker', () => {
    expect(source).toContain('name="add"');
    expect(source).toContain('tabBarButton: () => <CenterAddButton onPress={() => setGlobalAddVisible(true)} />');
    expect(source).toContain('<GlobalLogAddModal');
    expect(source).not.toContain("pathname: '/(tabs)/logs'");
    expect(source).not.toContain('openAdd: Date.now().toString()');
  });

  it('uses the Bebimom primary color for the center add button', () => {
    expect(source).toContain('backgroundColor: Colors.primary');
    expect(source).toContain('styles.centerAddButton');
  });
});
