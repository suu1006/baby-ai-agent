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

  it('uses a white settings background', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain('safe: { flex: 1, backgroundColor: Colors.white }');
  });

  it('does not show a gender icon beside the child name', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).not.toContain("name={activeChild.gender === 'male' ? 'male' : 'female'}");
  });

  it('shows child gender and age in one line', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain("{activeChild.gender === 'male' ? '남아' : '여아'}/{ageText}");
    expect(source).not.toContain('style={styles.profileGender}');
  });

  it('lets the user update the child profile photo from settings', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../app/(tabs)/settings.tsx'),
      'utf8',
    );

    expect(source).toContain("import * as ImagePicker from 'expo-image-picker';");
    expect(source).toContain('uploadChildProfilePhoto');
    expect(source).toContain('const { activeChild, children, setActiveChild, updateChild } = useChildStore();');
    expect(source).toContain('const [photoUpdating, setPhotoUpdating] = useState(false);');
    expect(source).toContain('const pickProfilePhoto = async () => {');
    expect(source).toContain('onPress={pickProfilePhoto}');
    expect(source).toContain('accessibilityLabel="아이 사진 수정"');
    expect(source).toContain("await updateChild(activeChild.id, { photo_url: publicUrl });");
  });

});
