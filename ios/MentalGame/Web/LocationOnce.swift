import CoreLocation

/// 웹이 라운드 날씨를 받을 때 한 번 부르는 대략적인 위치 (src/native.ts requestLocation).
/// '앱을 사용하는 동안'만 묻고, 기본은 대략적인 위치(Info.plist NSLocationDefaultAccuracyReduced).
/// 위치는 웹에 한 번 건네기만 하고 앱은 저장하지 않는다
final class LocationOnce: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    /// 답을 기다리는 요청 (권한 창이 떠 있는 동안 여러 번 와도 한 번에 답한다)
    private var waiting: [([String: Any]) -> Void] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func request(_ done: @escaping ([String: Any]) -> Void) {
        waiting.append(done)
        guard waiting.count == 1 else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            finish(["denied": true])
        default:
            manager.requestLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !waiting.isEmpty else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            finish(["denied": true])
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let c = locations.last?.coordinate else { return }
        finish(["lat": c.latitude, "lon": c.longitude])
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(["error": error.localizedDescription])
    }

    private func finish(_ payload: [String: Any]) {
        let done = waiting
        waiting = []
        done.forEach { $0(payload) }
    }
}
