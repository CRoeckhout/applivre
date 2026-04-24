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

  public init(bookTitle: String, bookAuthor: String, bookIsbn: String) {
    self.bookTitle = bookTitle
    self.bookAuthor = bookAuthor
    self.bookIsbn = bookIsbn
  }
}
