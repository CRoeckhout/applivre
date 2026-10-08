import type React from "react";
import AvatarFramesIcon from "./assets/icons/avatar-frames.svg?react";
import BadgesIcon from "./assets/icons/badges.svg?react";
import BooksIcon from "./assets/icons/books.svg?react";
import BordersIcon from "./assets/icons/borders.svg?react";
import EditorialIcon from "./assets/icons/editorial.svg?react";
import FondsIcon from "./assets/icons/fonds.svg?react";
import MusiquesIcon from "./assets/icons/musiques.svg?react";
import PillsIcon from "./assets/icons/pills.svg?react";
import ReleaseNotesIcon from "./assets/icons/release-notes.svg?react";
import ReportsIcon from "./assets/icons/reports.svg?react";
import StickersIcon from "./assets/icons/stickers.svg?react";
import SubscriptionsIcon from "./assets/icons/subscriptions.svg?react";
import TemplateGenresIcon from "./assets/icons/template-genres.svg?react";
import UsersIcon from "./assets/icons/users.svg?react";

// Ordre d'affichage dans la sidebar. L'id sert aussi de segment d'URL
// (`#/<tab>/<itemId>`).
export const TABS = [
  "users",
  "reports",
  "badges",
  "borders",
  "fonds",
  "stickers",
  "avatar-frames",
  "books",
  "pills",
  "musiques",
  "subscriptions",
  "editorial",
  "release-notes",
  "template-genres",
] as const;

export type Tab = (typeof TABS)[number];

export const DEFAULT_TAB: Tab = "users";

export function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

export const TAB_LABELS: Record<Tab, string> = {
  users: "Utilisateurs",
  reports: "Signalements",
  badges: "Badges",
  borders: "Cadres",
  fonds: "Fonds",
  stickers: "Stickers",
  "avatar-frames": "Cadres photo",
  books: "Livres",
  pills: "Défis bingo",
  musiques: "Musiques",
  subscriptions: "Abonnements",
  editorial: "Fil d'actualité",
  "release-notes": "Quoi de neuf",
  "template-genres": "Genres templates",
};

export const TAB_ICONS: Record<Tab, React.JSX.Element> = {
  users: <UsersIcon />,
  reports: <ReportsIcon />,
  badges: <BadgesIcon />,
  borders: <BordersIcon />,
  fonds: <FondsIcon />,
  stickers: <StickersIcon />,
  "avatar-frames": <AvatarFramesIcon />,
  books: <BooksIcon />,
  pills: <PillsIcon />,
  musiques: <MusiquesIcon />,
  subscriptions: <SubscriptionsIcon />,
  editorial: <EditorialIcon />,
  "release-notes": <ReleaseNotesIcon />,
  "template-genres": <TemplateGenresIcon />,
};
