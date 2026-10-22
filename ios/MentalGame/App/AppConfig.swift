import Foundation

/// 앱 설정값
enum AppConfig {
    /// 로그인(카카오·구글) 뒤 앱으로 돌아오는 주소의 스킴: kr.mentalgame.golf://login-callback
    /// (Supabase Redirect URLs 에 등록해야 한다)
    static let callbackScheme = "kr.mentalgame.golf"

    /// 앱이 띄우는 웹. 웹을 배포하면 앱도 바로 바뀐다
    static let webURL: URL = {
        #if DEBUG
        // 시뮬레이터 테스트: 이 Mac 의 개발 서버를 띄운다 (SIMCTL_CHILD_MG_WEB_URL)
        if let s = ProcessInfo.processInfo.environment["MG_WEB_URL"], let url = URL(string: s) {
            return url
        }
        #endif
        let host = (Bundle.main.object(forInfoDictionaryKey: "MGWebHost") as? String) ?? ""
        return URL(string: "https://\(host.isEmpty ? "mental-game-two.vercel.app" : host)")!
    }()

    /// 웹이 iOS 앱 안에서 열렸는지 알 수 있게 User-Agent 끝에 붙인다 (Safari 와 같은 Mobile 표시는 유지)
    static let userAgentApplicationName: String = {
        let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
        return "Mobile/15E148 MentalGameApp/\(version)"
    }()
}
