import Foundation
@preconcurrency import HealthKit
import Observation

/*
 * 라운드 동안 '골프 운동'을 켜 둔다.
 * 운동이 켜져 있으면 손목을 내려도 시계 화면으로 돌아가지 않고 앱이 계속 앞에 있다 (상시표시 워치는 어둡게 보인다).
 * 라운드가 끝나면 건강 앱에 골프 운동(시간·활동 칼로리·심박수)으로 저장해 활동 링에 들어간다.
 * 건강 데이터는 워치·아이폰의 건강 앱에만 있고 우리 서버로 보내지 않는다
 */
@Observable
final class GolfWorkout: NSObject {
    /// 운동이 켜져 있는지
    private(set) var running = false
    /// 건강 앱을 쓸 수 없거나 권한을 거절함 (화면 유지가 안 된다)
    private(set) var unavailable = false

    @ObservationIgnored private let health = HKHealthStore()
    @ObservationIgnored private var session: HKWorkoutSession?
    @ObservationIgnored private var builder: HKLiveWorkoutBuilder?
    /// 이 운동의 라운드 (다른 라운드가 오면 앞의 것을 끝낸다)
    @ObservationIgnored private(set) var roundId: String?

    private static let roundKey = "mg.workoutRound"

    /// 라운드를 시작하면 (이미 그 라운드로 켜져 있으면 그대로)
    func start(roundId: String) async {
        if running {
            if self.roundId == roundId { return }
            await end()
        }
        guard HKHealthStore.isHealthDataAvailable() else {
            unavailable = true
            return
        }
        // 처음 한 번 건강 권한을 묻는다 (거절해도 기록은 되고, 화면 유지만 안 된다)
        let share: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.heartRate),
        ]
        do {
            try await health.requestAuthorization(toShare: share, read: [])
        } catch {
            unavailable = true
            return
        }
        guard health.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else {
            unavailable = true
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor
        do {
            let session = try HKWorkoutSession(healthStore: health, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: health, workoutConfiguration: config)
            session.delegate = self
            let now = Date()
            session.startActivity(with: now)
            try await builder.beginCollection(at: now)
            self.session = session
            self.builder = builder
            self.roundId = roundId
            running = true
            unavailable = false
            UserDefaults.standard.set(roundId, forKey: Self.roundKey)
        } catch {
            unavailable = true
        }
    }

    /// 라운드가 끝나면: 운동을 끝내고 건강 앱에 골프 운동으로 저장한다
    func end() async {
        guard let session, let builder else { return }
        self.session = nil
        self.builder = nil
        roundId = nil
        running = false
        UserDefaults.standard.removeObject(forKey: Self.roundKey)
        session.end()
        do {
            try await builder.endCollection(at: Date())
            _ = try await builder.finishWorkout()
        } catch {
            // 저장하지 못해도 운동은 끝낸다
        }
    }

    /// 운동 중에 앱이 꺼졌다 다시 켜지면 이어 받는다 (워치가 앱을 다시 띄운다)
    func recover() async {
        guard session == nil else { return }
        guard let session = try? await health.recoverActiveWorkoutSession() else { return }
        session.delegate = self
        self.session = session
        builder = session.associatedWorkoutBuilder()
        roundId = UserDefaults.standard.string(forKey: Self.roundKey)
        running = true
    }
}

extension GolfWorkout: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}
}
