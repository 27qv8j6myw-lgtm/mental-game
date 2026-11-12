import Foundation
import WatchConnectivity

/// 애플워치로 기록하기: 웹이 보낸 라운드 연결 정보(그 라운드의 내 기록만 쓰는 열쇠·라운드)를 워치에 넘긴다.
/// 워치는 그 열쇠로 바로 Supabase 에 저장하니 아이폰은 넘겨 주기만 한다 (src/watch.ts, supabase/watch.sql, MentalGameWatch)
final class WatchLink: NSObject {
    static let shared = WatchLink()

    /// 세션이 켜지기 전에 받은 연결 정보 (켜지면 보낸다)
    private var pending: [String: Any]?

    /// 앱이 시작할 때 한 번
    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// 웹이 보낸 연결 정보. nil 이면 워치에서 라운드를 내린다
    func send(_ ctx: [String: Any]?) {
        guard WCSession.isSupported() else { return }
        // 같은 내용이어도 워치가 새로 받게 보낸 시각을 붙인다
        let payload: [String: Any] = ["ctx": ctx ?? [:], "sentAt": Date().timeIntervalSince1970]
        guard WCSession.default.activationState == .activated else {
            pending = payload
            return
        }
        push(payload)
    }

    private func push(_ payload: [String: Any]) {
        let session = WCSession.default
        guard session.isPaired, session.isWatchAppInstalled else { return }
        // 마지막 값만 남는 통로: 워치 앱이 꺼져 있어도 다음에 열 때 받는다
        try? session.updateApplicationContext(payload)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    /// 내 정보 → 애플워치 화면의 상태 한 줄
    func status() -> [String: Any] {
        guard WCSession.isSupported() else { return ["unsupported": true] }
        let session = WCSession.default
        return ["paired": session.isPaired, "installed": session.isWatchAppInstalled, "reachable": session.isReachable]
    }

    fileprivate func activated() {
        if let payload = pending {
            pending = nil
            push(payload)
        }
    }
}

extension WatchLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        guard state == .activated else { return }
        Task { @MainActor in WatchLink.shared.activated() }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    /// 다른 워치로 바꿨을 때: 새 워치와 다시 잇는다
    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    /// 워치가 마지막 연결 정보를 달라고 할 때 (워치 앱을 새로 깔았을 때 등)
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        replyHandler(session.applicationContext)
    }
}
