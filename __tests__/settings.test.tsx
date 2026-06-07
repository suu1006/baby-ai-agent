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

  it('uses the app background color on settings', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain('safe: { flex: 1, backgroundColor: Colors.background }');
  });

  it('does not show a gender icon beside the child name', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).not.toContain("name={activeChild.gender === 'male' ? 'male' : 'female'}");
  });

  it('shows child age and gender in the profile carousel', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain('<Text style={styles.profileAge}>{age}</Text>');
    expect(source).toContain("{child.gender === 'male' ? '남자아이' : '여자아이'}");
    expect(source).toContain('style={styles.profileGender}');
  });

  it('lets the user delete a child from settings', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain('const { activeChild, children, setActiveChild, deleteChild } = useChildStore();');
    expect(source).toContain('const handleDeleteChild = (child: { id: string; name: string }) => {');
    expect(source).toContain('const ok = await deleteChild(child.id);');
    expect(source).toContain('onPress={() => handleDeleteChild(child)}');
    expect(source).toContain('name="trash-outline"');
  });

});
