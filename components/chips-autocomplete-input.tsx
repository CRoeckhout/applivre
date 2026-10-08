import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

type Props = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  // Source de suggestions (RPC catalogue). Appelée avec la saisie debouncée.
  fetchSuggestions: (query: string) => Promise<string[]>;
  queryKey: string;
  placeholder?: string;
  // Nombre de caractères avant d'interroger la source (0 = suggestions dès
  // l'ouverture, utile pour les genres).
  minChars?: number;
};

const key = (s: string) => s.trim().toLocaleLowerCase('fr');

// Chips sélectionnés + saisie libre + suggestions horizontales issues du
// catalogue. Valider la saisie (✓ ou « entrée ») ajoute la valeur telle
// quelle si elle n'est pas proposée.
export function ChipsAutocompleteInput({
  label,
  values,
  onChange,
  fetchSuggestions,
  queryKey,
  placeholder,
  minChars = 2,
}: Props) {
  const [draft, setDraft] = useState('');
  const debounced = useDebouncedValue(draft.trim(), 250);
  const selectedKeys = new Set(values.map(key));

  const { data, isFetching } = useQuery({
    queryKey: [queryKey, debounced],
    queryFn: () => fetchSuggestions(debounced),
    enabled: debounced.length >= minChars,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  const suggestions = (debounced.length >= minChars ? (data ?? []) : []).filter(
    (s) => !selectedKeys.has(key(s)),
  );

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || selectedKeys.has(key(v))) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };
  const removeAt = (v: string) => onChange(values.filter((x) => x !== v));
  const canAdd = draft.trim().length > 0;

  return (
    <View>
      <Text className="mb-1 text-xs uppercase tracking-wider text-ink-muted">{label}</Text>

      {values.length > 0 && (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {values.map((v) => (
            <Pressable
              key={v}
              onPress={() => removeAt(v)}
              className="flex-row items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 active:opacity-80">
              <Text className="font-sans-med text-paper">{v}</Text>
              <MaterialIcons name="close" size={14} color="#fbf8f4" />
            </Pressable>
          ))}
        </View>
      )}

      <View className="flex-row items-center gap-2 rounded-2xl bg-paper-warm px-4 py-3">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor="#6b6259"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={() => add(draft)}
          className="flex-1 text-base text-ink"
        />
        {isFetching ? <ActivityIndicator size="small" color="#c27b52" /> : null}
        <Pressable
          onPress={() => add(draft)}
          disabled={!canAdd}
          hitSlop={8}
          className={canAdd ? 'opacity-100' : 'opacity-40'}>
          <MaterialIcons name="check" size={20} color="#9b5a38" />
        </Pressable>
      </View>

      {suggestions.length > 0 && (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          className="mt-2"
          contentContainerClassName="gap-2">
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => add(s)}
              className="flex-row items-center gap-1.5 rounded-full bg-paper-warm px-3 py-1.5 active:bg-paper-shade">
              <MaterialIcons name="add" size={14} color="#6b6259" />
              <Text className="text-ink">{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
