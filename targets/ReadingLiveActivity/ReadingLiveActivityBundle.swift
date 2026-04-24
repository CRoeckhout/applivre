import ActivityKit
import SwiftUI
import WidgetKit

@main
struct ReadingLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    ReadingLiveActivityWidget()
  }
}

struct ReadingLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ReadingActivityAttributes.self) { context in
      // Vue lock-screen / banner.
      let isbn = context.attributes.bookIsbn
      HStack(spacing: 10) {
        Image(systemName: "book.fill")
          .foregroundStyle(.tint)
          .font(.title3)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.attributes.bookTitle)
            .font(.subheadline.bold())
            .lineLimit(1)
          if !context.attributes.bookAuthor.isEmpty {
            Text(context.attributes.bookAuthor)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
          Text(
            timerInterval: context.state.startedAt...Date.distantFuture,
            pauseTime: context.state.pausedAt,
            countsDown: false
          )
            .monospacedDigit()
            .font(.title3.bold())
            .foregroundStyle(.tint)
        }
        Spacer()
        // Pause / resume
        Link(destination: URL(string: "applivre://book/\(isbn)?action=\(context.state.isPaused ? "resume" : "pause")")!) {
          Image(systemName: context.state.isPaused ? "play.fill" : "pause.fill")
            .font(.title3)
            .foregroundStyle(.tint)
            .frame(width: 40, height: 40)
            .background(Color.gray.opacity(0.2))
            .clipShape(Circle())
        }
        // Stop
        Link(destination: URL(string: "applivre://book/\(isbn)?action=stop")!) {
          Image(systemName: "stop.fill")
            .font(.title3)
            .foregroundStyle(.red)
            .frame(width: 40, height: 40)
            .background(Color.gray.opacity(0.2))
            .clipShape(Circle())
        }
      }
      .padding()
      // Tap sur le body (en dehors des boutons) → ouvre la fiche livre.
      .widgetURL(URL(string: "applivre://book/\(isbn)"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "book.fill").foregroundStyle(.tint)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.attributes.bookTitle)
            .font(.caption.bold())
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(
            timerInterval: context.state.startedAt...Date.distantFuture,
            pauseTime: context.state.pausedAt,
            countsDown: false
          )
            .monospacedDigit()
            .font(.caption.bold())
        }
      } compactLeading: {
        Image(systemName: "book.fill").foregroundStyle(.tint)
      } compactTrailing: {
        Text(
          timerInterval: context.state.startedAt...Date.distantFuture,
          pauseTime: context.state.pausedAt,
          countsDown: false
        )
          .monospacedDigit()
      } minimal: {
        Image(systemName: "book.fill").foregroundStyle(.tint)
      }
    }
  }
}
