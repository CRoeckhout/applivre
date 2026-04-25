// Set curated d'icônes MaterialIcons pour les catégories de fiche de lecture.
// Mix filled / outlined selon ce qui rend mieux par contexte.
// `name` doit exister dans `@expo/vector-icons`/MaterialIcons baseline.

export type SheetIconEntry = {
  name: string; // MaterialIcons glyph name
  label: string;
};

export const SHEET_ICON_GROUPS: { title: string; icons: SheetIconEntry[] }[] = [
  {
    title: 'Sentiments',
    icons: [
      { name: 'favorite', label: 'Cœur plein' },
      { name: 'favorite-border', label: 'Cœur' },
      { name: 'star', label: 'Étoile pleine' },
      { name: 'star-border', label: 'Étoile' },
      { name: 'mood', label: 'Sourire' },
      { name: 'sentiment-very-satisfied', label: 'Joie' },
      { name: 'sentiment-very-dissatisfied', label: 'Tristesse' },
      { name: 'whatshot', label: 'Feu' },
      { name: 'auto-awesome', label: 'Étincelles' },
      { name: 'thumb-up', label: 'Pouce levé' },
      { name: 'thumb-down', label: 'Pouce bas' },
    ],
  },
  {
    title: 'Lecture',
    icons: [
      { name: 'menu-book', label: 'Livre ouvert' },
      { name: 'auto-stories', label: 'Pages tournent' },
      { name: 'library-books', label: 'Bibliothèque' },
      { name: 'book', label: 'Livre' },
      { name: 'bookmark', label: 'Marque-page' },
      { name: 'bookmark-border', label: 'Marque-page contour' },
      { name: 'edit-note', label: 'Notes' },
      { name: 'translate', label: 'Traduction' },
    ],
  },
  {
    title: 'Genres',
    icons: [
      { name: 'auto-fix-high', label: 'Magie' },
      { name: 'rocket-launch', label: 'SF' },
      { name: 'science', label: 'Science' },
      { name: 'theater-comedy', label: 'Théâtre' },
      { name: 'gavel', label: 'Justice' },
      { name: 'history-edu', label: 'Histoire' },
      { name: 'public', label: 'Voyage' },
      { name: 'pets', label: 'Animaux' },
      { name: 'forest', label: 'Nature' },
      { name: 'restaurant', label: 'Cuisine' },
      { name: 'sports-esports', label: 'Jeux' },
      { name: 'music-note', label: 'Musique' },
      { name: 'palette', label: 'Art' },
    ],
  },
  {
    title: 'Personnages',
    icons: [
      { name: 'person', label: 'Personne' },
      { name: 'group', label: 'Groupe' },
      { name: 'face', label: 'Visage' },
      { name: 'shield', label: 'Bouclier' },
      { name: 'visibility', label: 'Œil' },
      { name: 'psychology', label: 'Psychologie' },
    ],
  },
  {
    title: 'Repères',
    icons: [
      { name: 'check-circle', label: 'Validé' },
      { name: 'check-circle-outline', label: 'Validé contour' },
      { name: 'flag', label: 'Drapeau' },
      { name: 'access-time', label: 'Temps' },
      { name: 'calendar-today', label: 'Date' },
      { name: 'place', label: 'Lieu' },
      { name: 'lightbulb', label: 'Idée' },
      { name: 'lightbulb-outline', label: 'Idée contour' },
      { name: 'help-outline', label: 'Question' },
      { name: 'priority-high', label: 'Important' },
    ],
  },
];

export const SHEET_ICONS_FLAT: SheetIconEntry[] = SHEET_ICON_GROUPS.flatMap(
  (g) => g.icons,
);

// Palette curated pour la couleur d'une icône de catégorie.
export const SHEET_ICON_COLORS: string[] = [
  '#1f1a16', // ink (default)
  '#d4493e', // rouge
  '#d4a017', // jaune
  '#5fa84d', // vert
  '#4a90c2', // bleu clair
  '#8e5dc8', // violet
  '#c27b52', // accent
  '#9b5a38', // accent-deep
  '#e89b7a', // pêche
  '#5b8acf', // bleu marine
  '#3a7a5a', // sapin
  '#a8a8a8', // gris
];
