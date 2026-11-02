import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { fontSize, radius, control } from '../theme/tokens';
import { font } from '../theme/type';

// A password box with an eye button to show or hide what you typed.
export function PasswordField({
  label, placeholder, value, onChangeText, autoFocus, onSubmit, pill,
}: {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (t: string) => void;
  autoFocus?: boolean;
  onSubmit?: () => void;
  pill?: boolean;
}) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: label ? 18 : 0, gap: 8 }}>
      {!!label && <Text style={{ color: c.text, fontSize: 12, fontFamily: font.semibold }}>{label}</Text>}
      <View style={{ height: pill ? control.md : 52, borderRadius: pill ? radius.xl : 12, borderWidth: 1, borderColor: focus ? c.primary : c.divider, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center' }}>
        <TextInput
          accessibilityLabel={label ?? placeholder}
          placeholder={placeholder}
          placeholderTextColor={c.textSecondary}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmit}
          style={{ flex: 1, height: '100%', paddingLeft: pill ? 16 : 14, color: c.text, fontFamily: font.regular, fontSize: fontSize.body }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={show ? 'Hide password' : 'Show password'}
          onPress={() => setShow((s) => !s)}
          hitSlop={4}
          style={{ width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={show ? 'eyeOff' : 'eye'} size={22} color={c.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}
