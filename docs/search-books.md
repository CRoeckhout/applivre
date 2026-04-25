# Recherche de livres

Edge function `search-books` (`supabase/functions/search-books/index.ts`).
Multi-registres (Google Books, OpenLibrary, BNF), dédup par ISBN, ranking
multi-niveaux. Pas de cache DB — résultats trop volatils par clé textuelle.

Client : `lib/books.ts:search()` invoque la fonction via `supabase.functions.invoke`.

## Pipeline de ranking

```
query
  ├─ Google Books (langRestrict=fr)              → générique
  ├─ OpenLibrary (q=<query> language:fre)        → générique
  ├─ BNF SRU (FR-centric par nature)             → fallback
  └─ si looksLikeAuthor(query):
       ├─ Google `inauthor:"<query>"`            → bucket auteur
       └─ OpenLibrary `?author=<query>&q=language:fre` → bucket auteur

merge order:
  [bucket auteur trié par popularité]
  → [bucket générique trié par popularité]
  → [BNF, ordre source]
  → dedup ISBN
  → top N
```

## Levers en place

### 1. Intent auteur (`looksLikeAuthor`)
Heuristique : 3-30 lettres, mono-token, accents/apostrophe/tiret OK.
Match → fan-out 2 calls supplémentaires en parallèle (Google `inauthor:"X"` +
OL `author=X`). Résultats préfixés au merge.

Bucket auteur post-filtré strict : on garde uniquement les hits où le
patronyme apparaît dans `authors[]` (Google `inauthor:` matche parfois le
prénom dans des titres ou champs éditeur — ex. "Hugo" pollué par Mark Twain).

### 2. Popularité (`_pop`)
Champ interne (jamais exposé au client). Sources :
- Google : `volumeInfo.ratingsCount`
- OpenLibrary : `readinglog_count` (nb d'utilisateurs ayant le livre dans une
  étagère — signal le plus stable). Fallback `ratings_count`.
- BNF : pas de signal → ordre source préservé.

Tri DESC dans chaque bucket avant le merge.

### 3. Locale FR
- Google : param URL `langRestrict=fr` → titres + ISBN éditions FR.
- OpenLibrary : `language:fre` injecté dans `q` (et non comme param URL séparé).
  Critique : seule cette forme propage le filtre aux éditions imbriquées
  renvoyées via `fields=editions`. Sans ça, OL retombe sur le titre/ISBN du
  *work* canonique (généralement anglais).
- BNF : FR par construction.

### 4. Titres FR depuis OpenLibrary

OL renvoie par défaut le titre du *work* (canonique anglais), pas de
l'édition. Deux mécanismes en cascade dans `fetchOpenLibrary` :

1. **Edition FR inline** — `fields=editions,editions.title,editions.isbn,editions.language`.
   Quand la query texte matche les titres d'éditions (ex. `harry potter
   language:fre`), OL renvoie la 1ʳᵉ édition FR directement → on prend son
   titre + ISBN.
2. **Fallback per-work** — si `editions.docs` est vide (typique en mode
   auteur où le surname ne matche pas les titres d'édition), seconde requête
   à `/works/<key>/editions.json?limit=200`. On prend la 1ʳᵉ entrée dont
   `languages` contient `/languages/fre`. ISBN-13 prioritaire sur ISBN-10.

Coût : +N fetches OL en parallèle pour les works sans édition FR inline.
Acceptable car OL est rapide et pas de schema change.

Titres normalisés en NFC (OL renvoie parfois des diacritiques combinés
décomposés — ex. `à` au lieu de `à`).

## Comportement observé

| Query | Top 1 |
|---|---|
| `Rowling` | Harry Potter à l'école des sorciers [9782070643028] |
| `Harry Potter` | Harry Potter à l'école des sorciers |
| `Hugo` | Les misérables — Victor Hugo |
| `Le Petit Prince` | Le petit prince — Saint-Exupéry |

## Levers non implémentés

- **Cluster par œuvre** — OL expose `work` ID, regrouper les éditions et
  garder une seule édition canonique par œuvre. Évite par ex. plusieurs
  ISBN HP1 collés. Coût : regroupement + pick d'édition canonique.
- **Signal in-app** — incrémenter un compteur dans la table `books` à
  chaque ajout user, l'injecter au scoring. Long terme : reflète l'usage
  réel. Démarrage froid faible.
- **Score composite** — pondération exact-match titre, exact-match auteur,
  popularité, locale, in-app. Re-tri unique côté edge.

## Déploiement

Local (hot-reload sur edits) :
```bash
npx supabase functions serve search-books --no-verify-jwt
```

Prod :
```bash
npx supabase functions deploy search-books
```

Project linké : `nthmjgfqghznxqgidgdp` (applivre, Frankfurt).

## Test rapide

```bash
ANON="<EXPO_PUBLIC_SUPABASE_ANON_KEY>"
curl -s -X POST "https://nthmjgfqghznxqgidgdp.supabase.co/functions/v1/search-books" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON" \
  -d '{"query":"Rowling","limit":5}' | python3 -m json.tool
```
