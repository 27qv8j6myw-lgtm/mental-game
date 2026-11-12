import SwiftUI
import WatchKit

/// 멘탈게임 워치 앱: 기록 모드 라운드에서 홀마다 타수·퍼트·티샷 방향을 넣는다 (Link.swift, HoleView.swift)
@main
struct MentalGameWatchApp: App {
    @WKApplicationDelegateAdaptor private var delegate: AppDelegate
    @State private var store = WatchStore.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .onChange(of: scenePhase, initial: true) { _, phase in
                    if phase == .active { store.wake() }
                }
        }
    }
}

struct RootView: View {
    @Environment(WatchStore.self) private var store

    /// 끝난 라운드 한 줄: 골프장 · 총 타수 (파 대비)
    static func summary(_ round: RoundState) -> String {
        let scored = round.holes.filter { $0.rel != nil }
        guard !scored.isEmpty else { return round.course }
        let strokes = scored.reduce(0) { $0 + $1.par + ($1.rel ?? 0) }
        let rel = scored.reduce(0) { $0 + ($1.rel ?? 0) }
        return "\(round.course)\n총 \(strokes)타 (\(HoleView.relText(rel)))"
    }

    var body: some View {
        @Bindable var store = store
        if store.ctx == nil {
            Waiting(
                icon: "iphone",
                title: "폰에서 라운드를 열어 주세요",
                text: "멘탈게임 앱 내 정보 → 애플워치를 켜고 기록 모드 라운드를 열면 여기에 나와요."
            )
        } else if let round = store.round {
            if round.status == "done" {
                Waiting(icon: "flag.checkered", title: "라운드가 끝났어요", text: Self.summary(round))
            } else {
                // 위 막대(홀 이름)가 시계 줄에 붙고 스크롤되지 않게 NavigationStack 안에 둔다
                NavigationStack {
                    TabView(selection: $store.hole) {
                        ForEach(round.holes, id: \.i) { rec in
                            HoleView(rec: rec, holeCount: round.holes.count)
                                .tag(rec.i)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                }
            }
        } else if let problem = store.problem {
            Waiting(icon: "wifi.exclamationmark", title: "잠시 뒤 다시", text: problem)
        } else {
            ProgressView("불러오는 중")
        }
    }
}

/// 라운드가 없거나 끝났거나 연결이 안 될 때 안내: 큰 아이콘과 글을 화면 가운데에
struct Waiting: View {
    let icon: String
    let title: String
    let text: String

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 10) {
                    Image(systemName: icon)
                        .font(.system(size: 46, weight: .semibold))
                        .foregroundStyle(Theme.accent)
                    Text(title)
                        .font(.system(size: 18, weight: .bold))
                        .multilineTextAlignment(.center)
                    Text(text)
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 4)
                // 글이 짧으면 화면 가운데, 길면 스크롤
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
        }
    }
}

/// 골프 운동 중에 앱이 꺼졌다가 워치가 다시 띄우면 운동을 이어 받는다
final class AppDelegate: NSObject, WKApplicationDelegate {
    func handleActiveWorkoutRecovery() {
        Task { await WatchStore.shared.workout.recover() }
    }
}
