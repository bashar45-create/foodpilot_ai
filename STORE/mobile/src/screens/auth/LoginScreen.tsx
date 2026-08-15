import { memo, useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { AppText } from '@/lib/typography';
import { colors } from '@/lib/colors';

function LoginScreenImpl(): JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onEmailChange = useCallback((v: string) => setEmail(v), []);
  const onPasswordChange = useCallback((v: string) => setPassword(v), []);

  const submit = useCallback(async (): Promise<void> => {
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Check your connection and credentials.');
    } finally {
      setLoading(false);
    }
  }, [email, password, login]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.kav}
    >
      <AppScreen
        title="Worker sign in"
        subtitle="Use your store credentials to continue."
        scrollable={false}
      >
        <View style={styles.brandWrap}>
          <AppText variant="display">STORE</AppText>
          <AppText variant="caption">Worker console</AppText>
        </View>

        <Card>
          <View style={styles.field}>
            <AppText variant="overline">Email</AppText>
            <TextInput
              placeholder="you@store.com"
              placeholderTextColor={colors.textFaint}
              value={email}
              onChangeText={onEmailChange}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <AppText variant="overline">Password</AppText>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={colors.textFaint}
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry
              style={styles.input}
            />
          </View>
          {error ? <AppText variant="body">{error}</AppText> : null}
          <PrimaryButton
            label={loading ? 'Signing in…' : 'Sign in'}
            onPress={() => {
              void submit();
            }}
            disabled={loading}
          />
        </Card>

        <AppText variant="caption" style={styles.hint}>
          You must be assigned to a store. If you don't know your credentials, ask your store admin.
        </AppText>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

export const LoginScreen = memo(LoginScreenImpl);

const styles = StyleSheet.create({
  kav: { flex: 1, backgroundColor: colors.background },
  brandWrap: { alignItems: 'flex-start', gap: 4 },
  field: { gap: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    textAlign: 'center',
  },
});