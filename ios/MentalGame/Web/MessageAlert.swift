import UIKit

/// 웹의 alert·confirm 을 띄우는 알림 창.
/// 시스템 알림 창(UIAlertController)은 제목 없이 쓰면 내용이 제목 크기로 커서 짧은 문장도 줄이 바뀐다.
/// 모양은 시스템 알림 창과 같게(흐린 카드·알약 버튼), 글자만 작게 하고 카드를 조금 넓혀 문장이 한 줄에 들어가게 한다
final class MessageAlertController: UIViewController {
    struct Action {
        let title: String
        /// 확인처럼 기본 동작 (굵게)
        let primary: Bool
        let handler: () -> Void
    }

    private let message: String
    private let actions: [Action]

    init(message: String, actions: [Action]) {
        self.message = message
        self.actions = actions
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .overFullScreen
        modalTransitionStyle = .crossDissolve
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)

        let card = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        card.layer.cornerRadius = 30
        card.layer.cornerCurve = .continuous
        card.clipsToBounds = true
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        let label = UILabel()
        label.numberOfLines = 0
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 3
        label.attributedText = NSAttributedString(
            string: message,
            attributes: [
                .font: UIFont.systemFont(ofSize: 15),
                .foregroundColor: UIColor.label,
                .paragraphStyle: paragraph,
            ]
        )

        let buttons = UIStackView(arrangedSubviews: actions.map(makeButton))
        buttons.axis = .horizontal
        buttons.spacing = 10
        buttons.distribution = .fillEqually

        let content = UIStackView(arrangedSubviews: [label, buttons])
        content.axis = .vertical
        content.spacing = 20
        content.translatesAutoresizingMaskIntoConstraints = false
        card.contentView.addSubview(content)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
            // 시스템 알림 창보다 조금 넓게 (작은 폰은 양옆 20pt 남기고)
            card.widthAnchor.constraint(lessThanOrEqualTo: view.widthAnchor, constant: -40),
            {
                let w = card.widthAnchor.constraint(equalToConstant: 340)
                w.priority = .defaultHigh
                return w
            }(),
            content.topAnchor.constraint(equalTo: card.contentView.topAnchor, constant: 24),
            content.leadingAnchor.constraint(equalTo: card.contentView.leadingAnchor, constant: 22),
            content.trailingAnchor.constraint(equalTo: card.contentView.trailingAnchor, constant: -22),
            content.bottomAnchor.constraint(equalTo: card.contentView.bottomAnchor, constant: -16),
            buttons.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    private func makeButton(_ action: Action) -> UIButton {
        var config = UIButton.Configuration.gray()
        config.cornerStyle = .capsule
        config.baseForegroundColor = .label
        config.attributedTitle = AttributedString(
            action.title,
            attributes: AttributeContainer([.font: UIFont.systemFont(ofSize: 16, weight: action.primary ? .semibold : .regular)])
        )
        return UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in
            self?.dismiss(animated: true) { action.handler() }
        })
    }
}
