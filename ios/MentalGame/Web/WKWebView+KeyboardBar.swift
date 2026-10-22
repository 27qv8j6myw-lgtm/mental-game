import ObjectiveC
import UIKit
import WebKit

extension WKWebView {
    /// 키보드 위에 붙는 입력칸 이동 막대(∧ ∨ 완료)를 없앤다.
    /// 공개 API 가 없어서, 웹 내용 뷰(WKContentView)를 inputAccessoryView 가 nil 인 하위 클래스로 바꿔 끼운다
    func hideKeyboardAccessoryBar() {
        guard
            let content = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }),
            let base = object_getClass(content)
        else { return }
        let name = "\(NSStringFromClass(base))_NoAccessoryBar"
        var replaced: AnyClass? = NSClassFromString(name)
        if replaced == nil,
           let made = objc_allocateClassPair(base, name, 0),
           let method = class_getInstanceMethod(NoAccessoryBar.self, #selector(getter: NoAccessoryBar.inputAccessoryView)) {
            class_addMethod(
                made,
                #selector(getter: UIResponder.inputAccessoryView),
                method_getImplementation(method),
                method_getTypeEncoding(method)
            )
            objc_registerClassPair(made)
            replaced = made
        }
        if let replaced { object_setClass(content, replaced) }
    }
}

/// inputAccessoryView 를 nil 로 돌려주는 구현만 빌려 쓰는 클래스
private final class NoAccessoryBar: NSObject {
    @objc var inputAccessoryView: AnyObject? { nil }
}
