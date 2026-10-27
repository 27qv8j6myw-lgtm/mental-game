import SwiftUI
import WebKit

/// 앱의 유일한 화면: 웹(멘탈게임)을 화면 가득 띄운다.
/// 처음 열릴 때까지는 시작 화면과 같은 로고를, 연결이 안 되면 다시 시도 화면을 위에 덮는다
struct WebScreen: View {
    @State private var web = WebController()

    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            // 안전 영역(노치·홈 표시줄)은 웹이 CSS env(safe-area-inset-*) 로 직접 비킨다
            WebViewHost(webView: web.webView).ignoresSafeArea()

            if !web.hasLoaded && web.phase == .loading {
                SplashView().transition(.opacity)
            }
            if web.phase == .offline {
                OfflineView { web.retry() }.transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: web.phase)
        .animation(.easeOut(duration: 0.25), value: web.hasLoaded)
        // 앱 주소로 들어온 것: 로그인 결과(kr.mentalgame.golf://login-callback) · 초대(kr.mentalgame.golf://join?join=1234)
        .onOpenURL { web.openAppURL($0) }
        // 초대 링크(https://…/?join=1234)를 눌러 앱이 열렸을 때 (유니버설 링크)
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { web.openWebLink(url) }
        }
        // 화면 맨 위 가장자리를 누르면 시스템(알림 센터 내리기)보다 웹이 먼저 받는다.
        // 위쪽에 상태 표시줄이 없는 폰(iPhone Duo)에서 위 바 버튼이 눌리지 않던 문제
        .defersSystemGestures(on: .top)
    }
}

/// WKWebView 를 SwiftUI 에 붙인다 (웹뷰는 WebController 가 하나만 만들어 계속 쓴다)
private struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// 시작 화면(UILaunchScreen)과 같은 모양: 바탕색에 글자 로고.
/// 로고를 시작 화면과 같은 자리에 둬야 넘어갈 때 움찔 옮겨 가지 않는다. 시작 화면은
/// - 일반 아이폰: 안전 영역(위 상태 표시줄 ~ 아래 홈 표시줄) 가운데
/// - 옆에 카메라 막대가 있는 폰(iPhone Duo): 가로는 화면 전체 가운데, 세로는 그 막대 폭을 위쪽 여백처럼 센 가운데
private struct SplashView: View {
    var body: some View {
        GeometryReader { geo in
            let inset = geo.safeAreaInsets
            let width = inset.leading + geo.size.width + inset.trailing
            let height = inset.top + geo.size.height + inset.bottom
            let top = max(inset.top, inset.leading, inset.trailing)
            ZStack {
                Color("LaunchBackground")
                Image("LaunchLogo")
                    .position(x: width / 2, y: top + (height - top - inset.bottom) / 2)
            }
            .ignoresSafeArea()
        }
    }
}

/// 처음 열 때 연결이 안 되고 기기에 남은 화면도 없을 때
private struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        ZStack {
            Color("LaunchBackground").ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundStyle(.secondary)
                Text("연결이 안 돼요")
                    .font(.title3.bold())
                Text("인터넷 연결을 확인하고 다시 시도해 주세요.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("다시 시도", action: retry)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.top, 6)
            }
            .padding(32)
        }
    }
}
