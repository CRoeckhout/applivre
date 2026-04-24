import { BookCover } from "@/components/book-cover";
import { HomeCogMenu } from "@/components/home-cog-menu";
import { UsernameEditorModal } from "@/components/username-editor-modal";
import { signOut, useAuth } from "@/hooks/use-auth";
import { pullUserData } from "@/lib/sync/pull";
import { pushLocalData, type PushSummary } from "@/lib/sync/push";
import { flushQueue } from "@/lib/sync/queue";
import { useBookshelf } from "@/store/bookshelf";
import { useLoans } from "@/store/loans";
import { useProfile } from "@/store/profile";
import { useSyncQueue } from "@/store/sync-queue";
import type { BookLoan, UserBook } from "@/types/book";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type EnrichedLoan = { loan: BookLoan; book: UserBook };

export default function ProfileScreen() {
  const { session } = useAuth();
  const loans = useLoans((s) => s.loans);
  const books = useBookshelf((s) => s.books);
  const username = useProfile((s) => s.username);
  const [editingUsername, setEditingUsername] = useState(false);

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
    <SafeAreaView className="flex-1 bg-paper" edges={["top"]}>
      <ScrollView contentContainerClassName="px-6 pt-4 pb-24">
        <Animated.View
          entering={FadeInDown.duration(500)}
          className="flex-row items-start gap-3"
        >
          <View className="flex-1">
            <Text className="font-display text-4xl text-ink">Profil</Text>
            {session?.user.email && (
              <Text className="mt-1 text-base text-ink-muted">
                {session.user.email}
              </Text>
            )}
          </View>
          <HomeCogMenu />
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

        <SyncSection />

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

function SyncSection() {
  const { session } = useAuth();
  const pendingCount = useSyncQueue((s) => s.ops.length);
  const [state, setState] = useState<
    "idle" | "flushing" | "pushing" | "pulling"
  >("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const userId = session?.user.id;
  if (!userId) return null;

  const doFlush = async () => {
    setState("flushing");
    setFeedback(null);
    try {
      const r = await flushQueue();
      if (r.done > 0) setFeedback(`${r.done} opération(s) envoyée(s).`);
      else if (r.kept > 0) setFeedback("Échec : nouvelle tentative plus tard.");
      else setFeedback("Rien à renvoyer.");
    } finally {
      setState("idle");
    }
  };

  const doPush = async () => {
    setState("pushing");
    setFeedback(null);
    try {
      const s: PushSummary = await pushLocalData(userId);
      const parts = [
        s.userBooks && `${s.userBooks} livre${s.userBooks > 1 ? "s" : ""}`,
        s.sessions && `${s.sessions} session${s.sessions > 1 ? "s" : ""}`,
        s.loans && `${s.loans} prêt${s.loans > 1 ? "s" : ""}`,
        s.sheets && `${s.sheets} fiche${s.sheets > 1 ? "s" : ""}`,
        s.challenges && `${s.challenges} défi${s.challenges > 1 ? "s" : ""}`,
      ].filter(Boolean);
      const skippedMsg = s.skipped > 0 ? ` · ${s.skipped} ignoré(s)` : "";
      setFeedback(
        parts.length
          ? `Envoyé : ${parts.join(", ")}${skippedMsg}`
          : "Rien à synchroniser.",
      );
    } catch (e) {
      setFeedback(`Erreur : ${(e as Error).message}`);
    } finally {
      setState("idle");
    }
  };

  const doPull = async () => {
    setState("pulling");
    setFeedback(null);
    try {
      await pullUserData(userId);
      setFeedback("Données rechargées depuis le cloud.");
    } catch (e) {
      setFeedback(`Erreur : ${(e as Error).message}`);
    } finally {
      setState("idle");
    }
  };

  const busy = state !== "idle";

  return (
    <View className="mt-10">
      <Text className="mb-1 font-display text-xl text-ink">
        Synchronisation
      </Text>
      <Text className="mb-3 text-sm text-ink-muted">
        {pendingCount === 0
          ? "✓ Tout est à jour avec le cloud."
          : `⟳ ${pendingCount} opération${pendingCount > 1 ? "s" : ""} en attente.`}
      </Text>

      <View className="gap-2">
        {pendingCount > 0 && (
          <Pressable
            disabled={busy}
            onPress={doFlush}
            className={`flex-row items-center justify-center gap-2 rounded-full py-3 ${
              busy ? "bg-paper-shade" : "bg-accent active:opacity-80"
            }`}
          >
            {state === "flushing" && (
              <ActivityIndicator size="small" color="#fbf8f4" />
            )}
            <Text
              className={`font-sans-med ${busy ? "text-ink-muted" : "text-paper"}`}
            >
              Renvoyer maintenant
            </Text>
          </Pressable>
        )}

        <Pressable
          disabled={busy}
          onPress={doPull}
          className="flex-row items-center justify-center gap-2 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
        >
          {state === "pulling" && (
            <ActivityIndicator size="small" color="#6b6259" />
          )}
          <Text className="text-ink-soft">Recharger depuis le cloud</Text>
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={doPush}
          className="flex-row items-center justify-center gap-2 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
        >
          {state === "pushing" && (
            <ActivityIndicator size="small" color="#6b6259" />
          )}
          <Text className="text-ink-soft">Forcer l&apos;envoi local</Text>
        </Pressable>
      </View>

      {feedback && (
        <Text className="mt-3 text-center text-xs text-ink-muted">
          {feedback}
        </Text>
      )}
    </View>
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
