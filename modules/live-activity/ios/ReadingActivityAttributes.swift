import ActivityKit
import Foundation

// Copie identique à targets/ReadingLiveActivity/ReadingActivityAttributes.swift.
// Swift n'autorise pas le partage direct entre une app et un app extension
// sans framework intermédiaire — duplication volontaire, garder alignée.
public struct ReadingActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var startedAt: Date
    public var isPaused: Bool
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
