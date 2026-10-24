import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { Button } from '@/src/components/Button';
import { ThemedText } from '@/src/components/ThemedText';
import { useAuth } from '@/src/auth';
import { colors, radius, space } from '@/src/theme/tokens';

const input = {
  minHeight: 48,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.card,
  color: colors.text,
  paddingHorizontal: space.xl,
  fontSize: 16,
};

export default function LoginScreen() {
  const login = useAuth((s) => s.login);
  const error = useAuth((s) => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    // The keyboard's go key gets here too, past the button's disabled state.
    if (submitting || !username.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, justifyContent: 'center', padding: space.xxxl, gap: space.xl }}>
      <ThemedText size="title">Gym Tracker</ThemedText>
      <View style={{ gap: space.md }}>
        <TextInput
          accessibilityLabel="Username"
          placeholder="Username"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
          value={username}
          onChangeText={setUsername}
          style={input}
        />
        <TextInput
          accessibilityLabel="Password"
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          style={input}
        />
      </View>
      {error ? (
        <ThemedText color="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
      <Button label="Log in" onPress={submit} disabled={submitting || !username.trim() || !password} />
    </KeyboardAvoidingView>
  );
}
