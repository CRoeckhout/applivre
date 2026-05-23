import ActivityKit
import SwiftUI
import UIKit
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
        BookCoverView(data: context.attributes.bookCoverData, size: .lockScreen)
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
            // Force SwiftUI à teardown/recreate le Text quand isPaused flippe.
            // Sans ça, le composant Text(timerInterval:) ne pickup pas
            // toujours le nouveau pauseTime sur un re-render normal — bug
            // matche le symptôme "pause widget ne fait pas figer le timer".
            .id(context.state.isPaused)
        }
        Spacer()

        // Pause / resume :
        // - iOS 17+ : Button(intent:) → instant, sans ouvrir l'app
        // - iOS 16  : Link → deep link (ouvre l'app, comportement antérieur)
        PauseResumeButton(isPaused: context.state.isPaused, isbn: isbn)

        // Stop : reste un Link → ouvre la fiche livre + finish modal
        // (besoin de saisir la page → on a besoin de la UI).
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
          BookCoverView(data: context.attributes.bookCoverData, size: .expandedIsland)
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
            .id(context.state.isPaused)
        }
      } compactLeading: {
        BookCoverView(data: context.attributes.bookCoverData, size: .compactIsland)
      } compactTrailing: {
        Text(
          timerInterval: context.state.startedAt...Date.distantFuture,
          pauseTime: context.state.pausedAt,
          countsDown: false
        )
          .monospacedDigit()
          .id(context.state.isPaused)
      } minimal: {
        // L'aire `minimal` est trop petite (~20pt) pour qu'un cover soit
        // lisible — on garde l'icône système.
        Image(systemName: "book.fill").foregroundStyle(.tint)
      }
    }
  }
}

// Bouton pause/resume avec branchement de version. Sur iOS 17+ on utilise
// LiveActivityIntent pour un tap instantané qui ne sort pas l'app. Sur iOS 16
// on retombe sur le Link classique (ouvre l'app via deep link).
private struct PauseResumeButton: View {
  let isPaused: Bool
  let isbn: String

  var body: some View {
    if #available(iOS 17.0, *) {
      if isPaused {
        Button(intent: ResumeReadingIntent()) {
          buttonContent
        }
        .buttonStyle(.plain)
      } else {
        Button(intent: PauseReadingIntent()) {
          buttonContent
        }
        .buttonStyle(.plain)
      }
    } else {
      let action = isPaused ? "resume" : "pause"
      Link(destination: URL(string: "applivre://book/\(isbn)?action=\(action)")!) {
        buttonContent
      }
    }
  }

  private var buttonContent: some View {
    Image(systemName: isPaused ? "play.fill" : "pause.fill")
      .font(.title3)
      .foregroundStyle(.tint)
      .frame(width: 40, height: 40)
      .background(Color.gray.opacity(0.2))
      .clipShape(Circle())
  }
}

// Affiche le cover du livre depuis les bytes JPEG embarqués dans les
// attributes. AsyncImage n'est pas fiable en Live Activity (pas d'accès
// réseau garanti dans le process widget) — on précache côté app principale.
// Fallback `book.fill` quand pas de bytes (URL absente ou échec download).
private struct BookCoverView: View {
  enum Size {
    case lockScreen      // banner lock-screen
    case expandedIsland  // Dynamic Island ouvert
    case compactIsland   // Dynamic Island fermé (zone leading)

    var dimensions: CGSize {
      switch self {
      case .lockScreen: return CGSize(width: 36, height: 48)
      case .expandedIsland: return CGSize(width: 28, height: 38)
      case .compactIsland: return CGSize(width: 20, height: 20)
      }
    }

    var cornerRadius: CGFloat {
      switch self {
      case .compactIsland: return 4
      default: return 5
      }
    }

    var fallbackFont: Font {
      switch self {
      case .lockScreen: return .title3
      case .expandedIsland: return .body
      case .compactIsland: return .caption
      }
    }
  }

  let data: Data?
  let size: Size

  var body: some View {
    let dims = size.dimensions

    if let data, let uiImage = UIImage(data: data) {
      Image(uiImage: uiImage)
        .resizable()
        .aspectRatio(contentMode: .fill)
        .frame(width: dims.width, height: dims.height)
        .clipShape(RoundedRectangle(cornerRadius: size.cornerRadius))
    } else {
      fallback
    }
  }

  private var fallback: some View {
    Image(systemName: "book.fill")
      .foregroundStyle(.tint)
      .font(size.fallbackFont)
      .frame(width: size.dimensions.width, height: size.dimensions.height)
  }
}
