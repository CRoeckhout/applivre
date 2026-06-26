import { usePaperScreenClass } from "@/components/app-fond-background";
import { BookCover } from "@/components/book-cover";
import { ReleaseNotesModal } from "@/components/release-notes-modal";
import { UsernameEditorModal } from "@/components/username-editor-modal";
import { signOut, useAuth } from "@/hooks/use-auth";
import { useReleaseNotes } from "@/hooks/use-release-notes";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { useBookshelf } from "@/store/bookshelf";
import { useLoans } from "@/store/loans";
import { useProfile } from "@/store/profile";
import type { BookLoan, UserBook } from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type EnrichedLoan = { loan: BookLoan; book: UserBook };

export default function ProfileScreen() {
  const paperScreen = usePaperScreenClass();
  const router = useRouter();
  const theme = useThemeColors();
  const { session } = useAuth();
  const loans = useLoans((s) => s.loans);
  const books = useBookshelf((s) => s.books);
  const username = useProfile((s) => s.username);
  const [editingUsername, setEditingUsername] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  // Fetch tout l'historique seulement quand l'utilisateur a tapé sur la
  // row "Quoi de neuf" — pas de prefetch silencieux à chaque visite du
  // profil.
  const releaseNotes = useReleaseNotes(showReleaseNotes, { forceAll: true });

  const { lent, borrowed } = useMemo(() => {
    const byId = new Map(books.map((b) => [b.id, b]));
    const enriched: EnrichedLoan[] = loans
      .filter((l) => !l.dateBack && byId.has(l.userBookId))
      .map((l) => ({ loan: l, book: byId.get(l.userBookId)! }));
    return {
      lent: enriched.filter((e) => e.loan.direction === "lent"),
      borrowed: enriched.filter((e) => e.loan.direction === "borrowed"),
    };
  }, [loans, books]);

  return (
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={["top"]}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-24">
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="flex-row items-center gap-3"
        >
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))}
            accessibilityLabel="Retour"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={22} color={theme.ink} />
          </Pressable>
          <View className="flex-1">
            <Text className="font-display text-4xl text-ink">Profil</Text>
            {session?.user.email && (
              <Text className="mt-1 text-base text-ink-muted">
                {session.user.email}
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => setShowReleaseNotes(true)}
            accessibilityLabel="Dernières nouveautés"
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade"
          >
            <MaterialIcons name="lightbulb-outline" size={22} color={theme.ink} />
          </Pressable>
        </Animated.View>

        <View className="mt-8">
          <Text className="mb-3 font-display text-xl text-ink">Mon compte</Text>
          <Pressable
            onPress={() => setEditingUsername(true)}
            className="flex-row items-center justify-between rounded-2xl bg-paper-warm px-5 py-4 active:bg-paper-shade"
          >
            <View className="flex-1">
              <Text className="text-xs uppercase tracking-wider text-ink-muted">
                Nom d&apos;utilisateur
              </Text>
              <Text className="mt-1 font-display text-base text-ink">
                {username ? `@${username}` : "Non défini"}
              </Text>
            </View>
            <Text className="text-sm text-accent-deep">Modifier</Text>
          </Pressable>
        </View>

        <UsernameEditorModal
          open={editingUsername}
          onClose={() => setEditingUsername(false)}
        />

        <Section
          title="Livres que j'ai prêtés"
          empty="Tu n'as prêté aucun livre actuellement."
        >
          {lent.map((e) => (
            <LoanRow key={e.loan.id} entry={e} />
          ))}
        </Section>

        <Section
          title="Livres empruntés"
          empty="Tu n'as emprunté aucun livre actuellement."
        >
          {borrowed.map((e) => (
            <LoanRow key={e.loan.id} entry={e} />
          ))}
        </Section>

        <ReleaseNotesModal
          open={showReleaseNotes}
          onClose={() => setShowReleaseNotes(false)}
          notes={releaseNotes.notes ?? []}
          loading={releaseNotes.notes === null}
        />

        <Pressable
          onPress={() => signOut()}
          className="mt-6 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
        >
          <Text className="text-center text-ink-muted">Se déconnecter</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const childArray = Array.isArray(children) ? children : [children];
  const hasContent = childArray.filter(Boolean).length > 0;

  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-xl text-ink">{title}</Text>
      {hasContent ? (
        children
      ) : (
        <View className="rounded-2xl bg-paper-warm px-5 py-6">
          <Text className="text-center text-sm text-ink-muted">{empty}</Text>
        </View>
      )}
    </View>
  );
}

function LoanRow({ entry }: { entry: EnrichedLoan }) {
  const router = useRouter();
  const { loan, book } = entry;
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(loan.dateOut).getTime()) / 86400000),
  );

  return (
    <Pressable
      onPress={() => router.push(`/book/${book.book.isbn}`)}
      className="mb-2 flex-row items-center gap-3 rounded-2xl bg-paper-warm p-3 active:bg-paper-shade"
    >
      <BookCover
        isbn={book.book.isbn}
        coverUrl={book.book.coverUrl}
        style={{ width: 44, height: 66, borderRadius: 6 }}
      />
      <View className="flex-1">
        <Text numberOfLines={1} className="font-display text-base text-ink">
          {book.book.title}
        </Text>
        <Text numberOfLines={1} className="text-sm text-ink-soft">
          {loan.direction === "lent" ? "chez" : "de"} {loan.contactName}
        </Text>
        <Text className="text-xs text-ink-muted">
          {days === 0
            ? "aujourd'hui"
            : `depuis ${days} jour${days > 1 ? "s" : ""}`}
        </Text>
      </View>
    </Pressable>
  );
}
