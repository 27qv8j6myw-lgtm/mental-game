import SwiftUI

/*
 * 폰 앱(웹)과 같은 글꼴: 글자는 Pretendard, 숫자는 Inter (src/index.css 의 --font · --font-num).
 * 글꼴 파일은 Fonts/ (Pretendard v1.3.9 · Inter, 둘 다 SIL OFL) 에 있고 Info.plist 의 UIAppFonts 로 올린다.
 * 크기는 시스템 글꼴을 쓰던 때처럼 고정한다. SF Symbols 아이콘은 그대로 시스템 글꼴로 크기를 정한다
 */
extension Font {
    /// 글자 (Pretendard)
    static func app(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .heavy, .black: name = "Pretendard-ExtraBold"
        case .bold: name = "Pretendard-Bold"
        case .semibold, .medium: name = "Pretendard-SemiBold"
        default: name = "Pretendard-Regular"
        }
        return .custom(name, fixedSize: size)
    }

    /// 숫자 (Inter, 폰 앱처럼 700 까지)
    static func num(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .custom(weight == .semibold || weight == .medium ? "Inter-SemiBold" : "Inter-Bold", fixedSize: size)
    }
}
