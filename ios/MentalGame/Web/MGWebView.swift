import UIKit
import WebKit

/// 화면 배치가 바뀔 때마다 onLayout 을 부르는 웹뷰: 창에 붙을 때, 크기(접기·펼치기·회전), 안전 영역, 세로 상태 막대 자리.
/// WebController 가 이때 상태 막대가 가리는 모서리와 접히는 곳을 웹에 넘긴다 (pushLayout)
final class MGWebView: WKWebView {
    var onLayout: (() -> Void)?

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        // 세로 상태 막대(아이폰 듀오)가 옮겨 가거나 켜지고 꺼질 때
        if #available(iOS 27.1, *) {
            registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) {
                (view: MGWebView, _: UITraitCollection) in
                view.onLayout?()
            }
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        onLayout?()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        onLayout?()
    }

    override func safeAreaInsetsDidChange() {
        super.safeAreaInsetsDidChange()
        onLayout?()
    }
}
