import Foundation
import Observation
import WatchConnectivity
import WatchKit

/*
 * 워치 쪽 연결과 저장.
 * 폰(멘탈게임 앱)이 기록 모드 라운드를 열면 '그 라운드의 내 기록만 쓰는 열쇠'를 넘겨 준다 (src/watch.ts → Web/WatchLink.swift).
 * 워치는 그 열쇠로 Supabase 의 watch_state(읽기)·watch_save(저장)만 부른다 (supabase/watch.sql).
 * 통신이 안 되면 저장 대기열에 두었다가 다시 될 때 보낸다
 */

/// 폰이 넘겨 준 라운드 연결 정보 (src/native.ts WatchContext)
struct WatchContext: Codable, Equatable {
    var url: String
    var anonKey: String
    var token: String
    var roundId: String
    var course: String
    var hole: Int
    var expiresAt: String
}

/// 홀 하나의 내 기록 (supabase/watch.sql watch_hole).
/// dir 은 티샷 방향 left·hit·short·right, lie 는 티샷 결과 bunker·ob·hazard (폰 기록 모드의 fairway·lie, 파4·파5 만 쓴다).
/// shotLies 는 폰의 디테일 기록에서 샷마다 고른 결과 (카운트가 그 아래로 내려가지 않게)
struct HoleRecord: Codable, Equatable {
    var i: Int
    var par: Int
    var rel: Int?
    var putts: Int?
    var dir: String?
    var lie: String?
    var ob = 0
    var hazard = 0
    var sand = 0
    var shotLies: [String] = []

    init(i: Int, par: Int, rel: Int?, putts: Int?, dir: String?, lie: String?, ob: Int, hazard: Int, sand: Int, shotLies: [String]) {
        (self.i, self.par, self.rel, self.putts, self.dir, self.lie) = (i, par, rel, putts, dir, lie)
        (self.ob, self.hazard, self.sand, self.shotLies) = (ob, hazard, sand, shotLies)
    }

    // 예전에 보관한 기록(카운트 칸이 없던 판)도 읽히게
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        i = try c.decode(Int.self, forKey: .i)
        par = try c.decode(Int.self, forKey: .par)
        rel = try c.decodeIfPresent(Int.self, forKey: .rel)
        putts = try c.decodeIfPresent(Int.self, forKey: .putts)
        dir = try c.decodeIfPresent(String.self, forKey: .dir)
        lie = try c.decodeIfPresent(String.self, forKey: .lie)
        ob = try c.decodeIfPresent(Int.self, forKey: .ob) ?? 0
        hazard = try c.decodeIfPresent(Int.self, forKey: .hazard) ?? 0
        sand = try c.decodeIfPresent(Int.self, forKey: .sand) ?? 0
        shotLies = try c.decodeIfPresent([String].self, forKey: .shotLies) ?? []
    }

    /// 넣은 것이 하나라도 있는지
    var hasData: Bool {
        rel != nil || putts != nil || dir != nil || lie != nil || ob > 0 || hazard > 0 || sand > 0
    }
}

/// 라운드와 홀마다 내 기록 (watch_state)
struct RoundState: Codable, Equatable {
    var roundId: String
    var course: String
    var status: String
    var holeCount: Int
    var holes: [HoleRecord]
}

/// 저장 대기 (보낼 때 쓴 열쇠도 함께 둔다. 폰이 다른 라운드를 보내도 이 홀은 원래 라운드로 간다)
struct PendingSave: Codable, Equatable {
    var url: String
    var anonKey: String
    var token: String
    var roundId: String
    var rec: HoleRecord
}

enum LinkError: Error {
    /// 열쇠가 끝났거나 맞지 않음 (폰에서 라운드를 다시 열어야 한다)
    case expired
    /// 서버가 받지 않는 값 (끝난 라운드 등). 다시 보내도 안 된다
    case rejected
    /// 통신이 안 됨 (나중에 다시)
    case offline
}

@Observable
final class WatchStore {
    /// 앱 하나에 하나 (운동을 이어 받을 때 앱 델리게이트도 쓴다)
    static let shared = WatchStore()

    private(set) var ctx: WatchContext?
    private(set) var round: RoundState?
    /// 보고 있는 홀 (0부터)
    var hole = 0
    private(set) var pending: [PendingSave] = []
    /// 화면 위 안내 한 줄
    private(set) var problem: String?
    /// 라운드 동안 켜 두는 골프 운동 (화면 유지 + 건강 앱 기록)
    let workout = GolfWorkout()

    @ObservationIgnored private var flushing = false
    @ObservationIgnored private var phone: PhoneLink?

    init() {
        ctx = Self.load("ctx")
        round = Self.load("round")
        pending = Self.load("pending") ?? []
        // 폰에서 보던 홀부터 (라운드를 받으면 범위를 다시 본다)
        if let ctx { hole = ctx.hole }
        let link = PhoneLink { [weak self] data in
            Task { @MainActor in self?.receive(data) }
        }
        phone = link
        link.start()
    }

    /// 앱이 앞으로 나올 때: 서버에서 새로 읽고 대기열을 보낸다. 연결 정보가 없으면 폰에 달라고 한다
    func wake() {
        guard ctx != nil else {
            phone?.ask()
            return
        }
        Task {
            await refresh()
            await flush()
            await syncWorkout(foreground: true)
        }
    }

    /// 모든 홀에 타수가 들어갔는지
    var complete: Bool {
        guard let round, !round.holes.isEmpty else { return false }
        return round.holes.allSatisfy { $0.rel != nil }
    }

    /// 골프 운동은 따로 끄고 켜는 버튼 없이 저절로: 진행 중인 라운드면 켜고,
    /// 라운드가 끝났거나 내려갔거나 모든 홀을 넣었으면 끈다 (끄면 건강 앱에 저장된다).
    /// 운동은 앱이 앞에 있을 때만 새로 켤 수 있다
    func syncWorkout(foreground: Bool) async {
        guard let ctx, let round, round.roundId == ctx.roundId, round.status == "playing", !complete else {
            await workout.end()
            return
        }
        if workout.running || !foreground { return }
        await workout.start(roundId: round.roundId)
    }

    func isPending(_ hole: Int) -> Bool {
        pending.contains { $0.roundId == ctx?.roundId && $0.rec.i == hole }
    }

    /// 한 홀 저장: 화면은 바로 바꾸고 보내기는 대기열로
    func save(_ rec: HoleRecord) {
        guard let ctx, var r = round else { return }
        if let idx = r.holes.firstIndex(where: { $0.i == rec.i }) { r.holes[idx] = rec }
        round = r
        Self.keep("round", r)
        pending.removeAll { $0.roundId == ctx.roundId && $0.rec.i == rec.i }
        pending.append(PendingSave(url: ctx.url, anonKey: ctx.anonKey, token: ctx.token, roundId: ctx.roundId, rec: rec))
        Self.keep("pending", pending)
        Task { await flush() }
        // 18홀(마지막 홀)까지 다 넣었으면 골프 운동을 끝낸다 (건강 앱에 저장)
        if complete { Task { await workout.end() } }
    }

    /// 마지막 홀에서 라운드 종료 (방장만, supabase/watch.sql watch_finish). 못 끝내면 안내 글을 돌려준다
    func finish() async -> String? {
        guard let ctx else { return "폰에서 라운드를 다시 열어 주세요." }
        // 방금 누른 저장이 보내지는 중이면 끝날 때까지 기다린 뒤 남은 것을 보낸다
        for _ in 0..<50 where flushing {
            try? await Task.sleep(for: .milliseconds(100))
        }
        await flush()
        if pending.contains(where: { $0.roundId == ctx.roundId }) {
            return "아직 서버에 못 보낸 홀이 있어요. 연결되면 다시 눌러 주세요."
        }
        do {
            _ = try await Self.rpc(url: ctx.url, key: ctx.anonKey, "watch_finish", ["p_token": ctx.token])
        } catch LinkError.offline {
            return "연결할 수 없어요. 잠시 뒤 다시 눌러 주세요."
        } catch LinkError.expired {
            return "연결이 끝났어요. 폰에서 라운드를 다시 열어 주세요."
        } catch {
            // 이미 끝난 라운드면 그대로 끝난 화면으로, 아니면 방장이 아니다
            await refresh()
            if round?.status == "done" {
                await workout.end()
                return nil
            }
            return "방장만 라운드를 끝낼 수 있어요. 폰에서 확인해 주세요."
        }
        await refresh()
        await workout.end()
        return nil
    }

    // MARK: - 폰에서 받기

    private func receive(_ data: Data) {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let raw = obj["ctx"] as? [String: Any]
        else { return }
        // 빈 연결 정보 = 폰에서 라운드를 내림 (라운드 끝·설정 끔·로그아웃)
        guard !raw.isEmpty,
              let json = try? JSONSerialization.data(withJSONObject: raw),
              let next = try? JSONDecoder().decode(WatchContext.self, from: json)
        else {
            ctx = nil
            round = nil
            problem = nil
            // 라운드가 끝났거나 폰에서 내렸다: 골프 운동을 끝내고 건강 앱에 저장
            Task { await workout.end() }
            Self.keep("ctx", WatchContext?.none)
            Self.keep("round", RoundState?.none)
            return
        }
        let sameRound = ctx?.roundId == next.roundId
        ctx = next
        Self.keep("ctx", next)
        if !sameRound {
            round = nil
            Self.keep("round", RoundState?.none)
        }
        // 폰에서 보고 있는 홀로
        hole = next.hole
        problem = nil
        Task {
            await refresh()
            await flush()
            // 끝난 라운드면 운동을 끈다 (새로 켜는 건 앱이 앞에 있을 때만)
            await syncWorkout(foreground: WKApplication.shared().applicationState == .active)
        }
    }

    // MARK: - 서버

    func refresh() async {
        guard let ctx else { return }
        do {
            let data = try await Self.rpc(url: ctx.url, key: ctx.anonKey, "watch_state", ["p_token": ctx.token])
            var next = try JSONDecoder().decode(RoundState.self, from: data)
            // 아직 못 보낸 홀은 워치에 넣은 값으로 보여 준다
            for p in pending where p.roundId == next.roundId {
                if let idx = next.holes.firstIndex(where: { $0.i == p.rec.i }) { next.holes[idx] = p.rec }
            }
            guard self.ctx?.roundId == next.roundId else { return }
            round = next
            Self.keep("round", next)
            if !next.holes.indices.contains(hole) { hole = 0 }
            problem = nil
        } catch LinkError.expired {
            problem = "연결이 끝났어요. 폰에서 라운드를 다시 열어 주세요."
            phone?.ask()
        } catch {
            if round == nil { problem = "연결할 수 없어요. 잠시 뒤 다시 열어 주세요." }
        }
    }

    func flush() async {
        guard !flushing else { return }
        flushing = true
        defer { flushing = false }
        while let p = pending.first {
            do {
                _ = try await Self.rpc(url: p.url, key: p.anonKey, "watch_save", [
                    "p_token": p.token,
                    "p_hole": p.rec.i,
                    "p_par": p.rec.par,
                    "p_rel": Self.json(p.rec.rel),
                    "p_putts": Self.json(p.rec.putts),
                    "p_dir": Self.json(p.rec.dir),
                    "p_lie": Self.json(p.rec.lie),
                    "p_ob": p.rec.ob,
                    "p_hazard": p.rec.hazard,
                    "p_sand": p.rec.sand,
                ])
                pending.removeFirst()
                Self.keep("pending", pending)
            } catch LinkError.offline {
                // 통신이 되면 다시 (앱을 다시 열거나 다음 저장 때)
                return
            } catch {
                // 열쇠가 끝났거나 받지 않는 값: 다시 보내도 안 되니 버리고 알린다
                pending.removeFirst()
                Self.keep("pending", pending)
                problem = "\(p.rec.i + 1)번 홀을 저장하지 못했어요. 폰에서 확인해 주세요."
            }
        }
    }

    private static func json<T>(_ v: T?) -> Any {
        if let v { return v }
        return NSNull()
    }

    private static func rpc(url: String, key: String, _ fn: String, _ body: [String: Any]) async throws -> Data {
        guard let endpoint = URL(string: "\(url)/rest/v1/rpc/\(fn)") else { throw LinkError.rejected }
        var req = URLRequest(url: endpoint, timeoutInterval: 15)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw LinkError.offline
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(code) { return data }
        let text = String(data: data, encoding: .utf8) ?? ""
        if text.contains("invalid watch token") { throw LinkError.expired }
        if code >= 500 { throw LinkError.offline }
        throw LinkError.rejected
    }

    // MARK: - 보관 (워치를 다시 켜도 남게)

    private static func load<T: Decodable>(_ key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: "mg.\(key)") else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func keep<T: Encodable>(_ key: String, _ value: T?) {
        if let value, let data = try? JSONEncoder().encode(value) {
            UserDefaults.standard.set(data, forKey: "mg.\(key)")
        } else {
            UserDefaults.standard.removeObject(forKey: "mg.\(key)")
        }
    }
}

/// 폰과 잇는 통로 (WatchConnectivity). 받은 연결 정보는 JSON 으로 바꿔 넘긴다
final class PhoneLink: NSObject, WCSessionDelegate {
    nonisolated let onContext: @Sendable (Data) -> Void

    init(onContext: @escaping @Sendable (Data) -> Void) {
        self.onContext = onContext
        super.init()
    }

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// 폰에 마지막 연결 정보를 달라고 한다 (폰 앱이 깨어나 답한다)
    func ask() {
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else { return }
        let deliver = onContext
        session.sendMessage(["ask": "ctx"], replyHandler: { reply in
            if let data = PhoneLink.data(reply) { deliver(data) }
        }, errorHandler: nil)
    }

    nonisolated static func data(_ dict: [String: Any]) -> Data? {
        guard !dict.isEmpty else { return nil }
        return try? JSONSerialization.data(withJSONObject: dict)
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        guard state == .activated, let data = Self.data(session.receivedApplicationContext) else { return }
        onContext(data)
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        if let data = Self.data(applicationContext) { onContext(data) }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let data = Self.data(message) { onContext(data) }
    }
}
