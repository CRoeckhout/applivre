import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

type Props = {
  open: boolean;
  initial: string[];
  suggestions: string[];
  onClose: () => void;
  onSave: (values: string[]) => void;
};

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (t.length === 0) continue;
    const key = t.toLocaleLowerCase('fr');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function GenreEditorModal({ open, initial, suggestions, onClose, onSave }: Props) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(initial);
      setDraft('');
    }
  }, [open, initial]);

  const selectedKeys = useMemo(
    () => new Set(selected.map((s) => s.toLocaleLowerCase('fr'))),
    [selected],
  );

  const toggle = (value: string) => {
    const key = value.toLocaleLowerCase('fr');
    if (selectedKeys.has(key)) {
      setSelected((prev) => prev.filter((s) => s.toLocaleLowerCase('fr') !== key));
    } else {
      setSelected((prev) => dedupe([...prev, value]));
    }
  };

  const addDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setSelected((prev) => dedupe([...prev, t]));
    setDraft('');
  };

  const handleSave = () => {
    onSave(dedupe(selected));
    onClose();
  };

  const handleClear = () => {
    onSave([]);
    onClose();
  };

  const canSubmit = draft.trim().length > 0;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5"
          style={{ maxHeight: '85%' }}>
          <Text className="font-display text-xl text-ink">Genres</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Coche les genres qui collent, ajoute les tiens.
          </Text>

          {selected.length > 0 && (
            <View className="mt-4">
              <Text className="mb-2 text-xs uppercase tracking-wider text-ink-muted">
                Sélection
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {selected.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => toggle(s)}
                    className="flex-row items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 active:opacity-80">
                    <Text className="font-sans-med text-paper">{s}</Text>
                    <MaterialIcons name="close" size={14} color="#fbf8f4" />
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-paper-warm px-4 py-3">
            <MaterialIcons name="add" size={18} color="#6b6259" />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ajouter un genre…"
              placeholderTextColor="rgb(107 98 89)"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={addDraft}
              className="flex-1 text-base text-ink"
            />
            <Pressable
              onPress={addDraft}
              disabled={!canSubmit}
              hitSlop={8}
              className={canSubmit ? 'opacity-100' : 'opacity-40'}>
              <MaterialIcons name="check" size={20} color="#9b5a38" />
            </Pressable>
          </View>

          {suggestions.length > 0 && (
            <View className="mt-4">
              <Text className="mb-2 text-xs uppercase tracking-wider text-ink-muted">
                Suggestions
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2">
                {suggestions.map((s) => {
                  const active = selectedKeys.has(s.toLocaleLowerCase('fr'));
                  return (
                    <Pressable
                      key={s}
                      onPress={() => toggle(s)}
                      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                        active ? 'bg-accent' : 'bg-paper-warm active:bg-paper-shade'
                      }`}>
                      <MaterialIcons
                        name={active ? 'check' : 'add'}
                        size={14}
                        color={active ? '#fbf8f4' : '#6b6259'}
                      />
                      <Text className={active ? 'text-paper' : 'text-ink'}>{s}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View className="mt-5 flex-row gap-2">
            {initial.length > 0 ? (
              <Pressable
                onPress={handleClear}
                className="rounded-full border border-ink-muted/30 px-4 py-3 active:opacity-70">
                <Text className="text-ink-muted">Effacer</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              className="flex-1 rounded-full bg-accent py-3 active:opacity-80">
              <Text className="text-center font-sans-med text-paper">Valider</Text>
            </Pressable>
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
