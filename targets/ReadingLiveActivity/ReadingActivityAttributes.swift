import ActivityKit
import Foundation

// Schéma partagé entre l'app principale et l'extension widget.
// Même définition dupliquée dans modules/live-activity/ios/ — garder
// les deux copies alignées.
public struct ReadingActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    // Date "virtuelle" de démarrage = wallStart + accumulatedPausedMs.
    // Permet à SwiftUI `Text(timerInterval:)` d'afficher l'elapsed réel.
    public var startedAt: Date
    public var isPaused: Bool
    // Wall-clock du moment où l'user a mis en pause. Passé comme
    // `pauseTime` à Text(timerInterval:) → fige l'affichage. nil = pas en pause.
    public var pausedAt: Date?

    public init(startedAt: Date, isPaused: Bool, pausedAt: Date? = nil) {
      self.startedAt = startedAt
      self.isPaused = isPaused
      self.pausedAt = pausedAt
    }
  }

  public var bookTitle: String
  public var bookAuthor: String
  public var bookIsbn: String
  // Bytes JPEG du cover, déjà downloadés et redimensionnés côté app principale
  // avant de créer l'Activity. On embarque les bytes plutôt que l'URL car le
  // process widget n'a pas d'accès réseau fiable et AsyncImage est peu sûr
  // en Live Activity. Budget ActivityKit = 4 Ko (attributes + state) → on
  // cible ~2 Ko après resize 60×80 JPEG q=0.4.
  public var bookCoverData: Data?

  public init(bookTitle: String, bookAuthor: String, bookIsbn: String, bookCoverData: Data? = nil) {
    self.bookTitle = bookTitle
    self.bookAuthor = bookAuthor
    self.bookIsbn = bookIsbn
    self.bookCoverData = bookCoverData
  }
}
