import AuthenticationServices
import Observation
import Photos
import UIKit
import WebKit

/// 웹뷰 하나를 만들고 다룬다: 페이지 이동 규칙, 로그인 창, 알림 창(alert·confirm), 내려받기, 연결 끊김.
/// 웹은 window.webkit.messageHandlers.mg 로 앱에 요청한다 (src/native.ts)
@Observable
final class WebController: NSObject {
    enum Phase { case loading, ready, offline }

    private(set) var phase: Phase = .loading
    /// 한 번이라도 화면을 다 불러왔는지 (그 뒤로는 시작 로고를 다시 덮지 않는다)
    private(set) var hasLoaded = false

    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private var authSession: ASWebAuthenticationSession?
    /// 통신이 안 돼서 기기에 남은 화면으로 열어 봤는지
    @ObservationIgnored private var triedCache = false
    @ObservationIgnored private var downloadURL: URL?
    /// 진행 중인 Apple 로그인 요청 번호 (웹에 답할 때 쓴다)
    @ObservationIgnored fileprivate var appleRequestID: Int?

    override init() {
        let contents = WKUserContentController()
        let config = WKWebViewConfiguration()
        config.userContentController = contents
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = AppConfig.userAgentApplicationName

        webView = WKWebView(frame: .zero, configuration: config)
        super.init()

        contents.add(WeakMessageHandler(self), name: "mg")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // 화면 왼쪽 끝에서 밀면 웹의 뒤로가기 (열린 시트·하위 화면을 닫는다)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.backgroundColor = UIColor(named: "LaunchBackground")
        // 안전 영역은 웹이 CSS 로 비킨다 (viewport-fit=cover)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // 화면 끝에서 더 끌어도 튕기지 않게 (튕기면 위에 고정한 상단 바까지 같이 내려온다)
        webView.scrollView.bounces = false
        // 키보드 위 입력칸 이동 막대(∧ ∨ 완료)는 띄우지 않는다
        webView.hideKeyboardAccessoryBar()
        #if DEBUG
        webView.isInspectable = true
        #endif
        load()
    }

    // MARK: - 불러오기

    private func load(fromCache: Bool = false) {
        var request = URLRequest(url: AppConfig.webURL)
        // 통신이 안 되면: 마지막으로 받아 둔 화면을 그대로 연다 (골프장처럼 신호가 약할 때)
        if fromCache { request.cachePolicy = .returnCacheDataDontLoad }
        webView.load(request)
    }

    func retry() {
        triedCache = false
        phase = .loading
        load()
    }

    /// 연결이 안 돼서 실패했는지 (취소·정책으로 멈춘 것은 실패가 아니다)
    private func isOfflineError(_ error: Error) -> Bool {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain else { return false }
        return [
            NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
            NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed,
            NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff, NSURLErrorResourceUnavailable,
        ].contains(e.code)
    }

    private func loadFailed(_ error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return } // 내려받기 등으로 페이지 이동이 멈춤
        guard !hasLoaded else { return }
        if isOfflineError(error) && !triedCache {
            triedCache = true
            load(fromCache: true)
            return
        }
        phase = .offline
    }

    // MARK: - 로그인 (카카오·구글)

    /// 구글은 앱 안 웹뷰에서의 로그인을 막아서, 시스템 로그인 창(ASWebAuthenticationSession)에서 연다.
    /// 끝나면 kr.mentalgame.golf://login-callback#access_token=… 으로 돌아오고, 그 값을 웹에 넘겨 로그인한다
    private func startLogin(_ url: URL) {
        authSession?.cancel()
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: AppConfig.callbackScheme) {
            [weak self] callback, _ in
            Task { @MainActor in
                self?.authSession = nil
                // 창을 닫았으면(취소) callback 이 없다: 그대로 둔다
                if let callback { self?.openLoginCallback(callback) }
            }
        }
        session.presentationContextProvider = self
        authSession = session
        session.start()
    }

    /// 로그인 창에 띄울 수 있는 주소: https (개발 중에는 이 Mac 의 테스트 서버 http 도)
    private func isLoginURL(_ url: URL) -> Bool {
        #if DEBUG
        if url.scheme == "http" { return true }
        #endif
        return url.scheme == "https"
    }

    /// 로그인 결과(#access_token=… 또는 ?code=…, 실패면 ?error=…)를 웹 첫 화면 주소에 붙여 연다 → 웹이 읽어 로그인
    func openLoginCallback(_ callback: URL) {
        guard callback.scheme == AppConfig.callbackScheme,
              let from = URLComponents(url: callback, resolvingAgainstBaseURL: false),
              var to = URLComponents(url: AppConfig.webURL, resolvingAgainstBaseURL: false)
        else { return }
        to.path = "/"
        // 지금 화면과 # 뒤만 다르면 웹이 새로 열리지 않아(같은 문서 안 이동) 로그인 결과를 못 읽는다: 매번 다른 값을 붙인다
        let stamp = "mg_login=\(Int(Date().timeIntervalSince1970))"
        to.percentEncodedQuery = [from.percentEncodedQuery, stamp].compactMap { $0 }.joined(separator: "&")
        to.percentEncodedFragment = from.percentEncodedFragment
        if let url = to.url { webView.load(URLRequest(url: url)) }
    }

    // MARK: - 바깥으로 열기

    /// 멘탈게임 웹 주소인지 (개발 중이면 개발 서버)
    private func isAppPage(_ url: URL) -> Bool {
        url.host == AppConfig.webURL.host && url.port == AppConfig.webURL.port
    }

    private func openOutside(_ url: URL) {
        UIApplication.shared.open(url)
    }

    // MARK: - 화면 위에 띄우기 (알림 창·공유 시트)

    private func present(_ vc: UIViewController) {
        var top = webView.window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        top?.present(vc, animated: true)
    }
}

// MARK: - 앱 → 웹 답, 사진 저장

extension WebController {
    /// 웹의 window.mgNative.reply(id, 결과) 로 돌려준다 (src/native.ts)
    func reply(_ id: Int, _ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.mgNative && window.mgNative.reply(\(id), \(json))")
    }

    /// 사진 보관함에 이미지를 더한다 (처음 한 번 '사진 추가' 권한을 묻는다)
    fileprivate func saveToPhotos(_ data: Data, requestID id: Int) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                Task { @MainActor in self.reply(id, ["denied": true]) }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }) { ok, error in
                Task { @MainActor in
                    self.reply(id, ok ? ["saved": true] : ["error": error?.localizedDescription ?? "unknown"])
                }
            }
        }
    }
}

// MARK: - 웹 → 앱 요청

extension WebController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "oauth":
            // 우리 웹에서 온 요청만 받는다
            guard let page = message.frameInfo.request.url, isAppPage(page),
                  let s = body["url"] as? String, let url = URL(string: s), isLoginURL(url)
            else { return }
            startLogin(url)
        case "apple":
            guard let page = message.frameInfo.request.url, isAppPage(page),
                  let id = body["id"] as? Int, let nonce = body["nonce"] as? String
            else { return }
            startAppleLogin(requestID: id, nonce: nonce)
        case "saveImage":
            // 스코어카드·정산 결과 이미지를 사진 보관함에 바로 저장한다 (공유 창을 거치지 않고)
            guard let page = message.frameInfo.request.url, isAppPage(page),
                  let id = body["id"] as? Int, let b64 = body["data"] as? String,
                  let data = Data(base64Encoded: b64), UIImage(data: data) != nil
            else { return }
            saveToPhotos(data, requestID: id)
        default:
            break
        }
    }
}

// MARK: - 페이지 이동

extension WebController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        if action.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else {
            decisionHandler(.allow)
            return
        }
        switch scheme {
        case "http", "https":
            // 멘탈게임 화면이거나 화면 안의 작은 창(iframe)이면 그대로, 다른 사이트로 가는 링크는 Safari 로
            if isAppPage(url) || action.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
            } else {
                openOutside(url)
                decisionHandler(.cancel)
            }
        case "blob", "data", "about":
            decisionHandler(.allow)
        default:
            // 전화·메일·카카오톡 등 다른 앱 주소
            openOutside(url)
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor response: WKNavigationResponse,
        decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void
    ) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasLoaded = true
        phase = .ready
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadFailed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadFailed(error)
    }

    /// 메모리가 부족해 웹 화면이 꺼졌으면 다시 띄운다
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }
}

// MARK: - 새 창·알림 창 (웹의 window.open·alert·confirm)

extension WebController: WKUIDelegate {
    /// target=_blank·window.open: 멘탈게임 화면이면 이 화면에서, 다른 사이트면 Safari 로
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = action.request.url {
            if isAppPage(url) { webView.load(action.request) } else { openOutside(url) }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor () -> Void
    ) {
        present(MessageAlertController(message: message, actions: [
            .init(title: "확인", primary: true) { completionHandler() },
        ]))
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor (Bool) -> Void
    ) {
        present(MessageAlertController(message: message, actions: [
            .init(title: "취소", primary: false) { completionHandler(false) },
            .init(title: "확인", primary: true) { completionHandler(true) },
        ]))
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "확인", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert)
    }
}

// MARK: - 내려받기 (정산 이미지 저장 등): 받은 파일을 공유 시트로 (사진에 저장·카톡 보내기)

extension WebController: WKDownloadDelegate {
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping @MainActor (URL?) -> Void
    ) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(suggestedFilename)
        try? FileManager.default.removeItem(at: url)
        downloadURL = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloadURL else { return }
        downloadURL = nil
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // 아이패드에서 띄울 자리 (아이폰은 쓰지 않는다)
        sheet.popoverPresentationController?.sourceView = webView
        present(sheet)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadURL = nil
    }
}

// MARK: - Apple 로 로그인: 아이폰의 Apple 로그인 창 → 신원 토큰을 웹에 넘겨 Supabase 로그인

extension WebController: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    /// 웹이 준 nonce(SHA-256)를 Apple 에 넘기면 신원 토큰에 그대로 담겨 온다 (웹이 원래 값으로 확인)
    fileprivate func startAppleLogin(requestID: Int, nonce: String) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        appleRequestID = requestID
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8)
        else {
            replyApple(["error": "신원 토큰이 없어요"])
            return
        }
        var result: [String: Any] = ["idToken": token]
        // 이름은 처음 로그인할 때만 온다 (한국식: 성 + 이름)
        if let name = credential.fullName {
            let full = [name.familyName, name.givenName].compactMap { $0 }.joined()
            if !full.isEmpty { result["fullName"] = full }
        }
        replyApple(result)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled {
            replyApple(["cancelled": true])
        } else {
            replyApple(["error": error.localizedDescription])
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        webView.window ?? ASPresentationAnchor()
    }

    private func replyApple(_ payload: [String: Any]) {
        guard let id = appleRequestID else { return }
        appleRequestID = nil
        reply(id, payload)
    }
}

// MARK: - 로그인 창을 띄울 자리

extension WebController: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView.window ?? ASPresentationAnchor()
    }
}

/// 웹뷰가 메시지 처리기를 강하게 붙잡아 컨트롤러가 풀리지 않는 것을 막는다
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
