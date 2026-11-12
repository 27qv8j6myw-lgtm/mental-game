import SwiftUI

@main
struct MentalGameApp: App {
    init() {
        // 애플워치로 기록하기: 워치와 잇는 통로를 켠다 (Web/WatchLink.swift)
        WatchLink.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            WebScreen()
        }
    }
}
