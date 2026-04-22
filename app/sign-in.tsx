import { requestEmailOtp, verifyEmailOtp } from '@/hooks/use-auth';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Step = 'email' | 'code';

export default function SignInScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const codeValid = code.trim().length === 6;

  const requestCode = async () => {
    if (!emailValid) return;
    setLoading(true);
    setError(null);
    const { error } = await requestEmailOtp(email);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    if (!codeValid) return;
    setLoading(true);
    setError(null);
    const { error } = await verifyEmailOtp(email, code);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <View className="flex-1 justify-center px-8">
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text className="font-display text-5xl text-ink">Applivre</Text>
            <Text className="mt-2 text-base text-ink-muted">
              Ta bibliothèque, tes lectures, dans ta poche.
            </Text>
          </Animated.View>

          {step === 'email' ? (
            <Animated.View entering={FadeIn.duration(400).delay(120)} className="mt-12">
              <Text className="mb-2 text-sm text-ink-soft">Ton adresse email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="toi@exemple.fr"
                placeholderTextColor="#6b6259"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                className="rounded-2xl bg-paper-warm px-5 py-4 text-base text-ink"
              />
              {error && <Text className="mt-3 text-sm text-accent-deep">{error}</Text>}
              <Pressable
                disabled={!emailValid || loading}
                onPress={requestCode}
                className={`mt-5 rounded-full py-3 ${
                  emailValid && !loading ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
                }`}>
                {loading ? (
                  <ActivityIndicator color="#fbf8f4" />
                ) : (
                  <Text
                    className={`text-center font-sans-med ${
                      emailValid ? 'text-paper' : 'text-ink-muted'
                    }`}>
                    Recevoir un code
                  </Text>
                )}
              </Pressable>
              <Text className="mt-4 text-center text-xs text-ink-muted">
                Pas de mot de passe. On t&apos;envoie un code à 6 chiffres.
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(400)} className="mt-12">
              <Text className="mb-2 text-sm text-ink-soft">
                Code envoyé à <Text className="text-ink">{email}</Text>
              </Text>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor="#6b6259"
                keyboardType="number-pad"
                autoFocus
                className="rounded-2xl bg-paper-warm px-5 py-4 text-center text-3xl text-ink"
                style={{ fontVariant: ['tabular-nums'], letterSpacing: 8 }}
                maxLength={6}
              />
              {error && <Text className="mt-3 text-sm text-accent-deep">{error}</Text>}
              <Pressable
                disabled={!codeValid || loading}
                onPress={verify}
                className={`mt-5 rounded-full py-3 ${
                  codeValid && !loading ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
                }`}>
                {loading ? (
                  <ActivityIndicator color="#fbf8f4" />
                ) : (
                  <Text
                    className={`text-center font-sans-med ${
                      codeValid ? 'text-paper' : 'text-ink-muted'
                    }`}>
                    Se connecter
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setCode('');
                  setError(null);
                  setStep('email');
                }}
                className="mt-4">
                <Text className="text-center text-sm text-ink-muted">Changer d&apos;email</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
