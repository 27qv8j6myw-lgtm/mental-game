import SwiftUI
import WatchKit

/// 워치 색 (어두운 화면 위 남색 블록 + 앱 파랑)
enum Theme {
    static let accent = Color(red: 0.33, green: 0.56, blue: 1.0)
    static let block = Color(red: 0.11, green: 0.14, blue: 0.22)
    static let control = Color.white.opacity(0.13)
    static let saved = Color(red: 0.36, green: 0.84, blue: 0.56)
    static let pending = Color.orange
    static let finish = Color(red: 0.90, green: 0.26, blue: 0.32)

    /// PAR 3 · 4 · 5 버튼 색 (파가 한눈에 구분되게: 초록 · 보라 · 주황)
    static func par(_ p: Int) -> Color {
        switch p {
        case 3: return Color(red: 0.16, green: 0.70, blue: 0.40)
        case 5: return Color(red: 0.95, green: 0.52, blue: 0.10)
        default: return Color(red: 0.56, green: 0.40, blue: 0.96)
        }
    }
}

/// 홀 하나. 위(홀 · 파 · 누적 타수)는 고정, 아래 블록(타수 · 퍼트 · 티샷 · OB · 해저드 · 샌드샷 · 저장)은 스크롤.
/// 마지막 홀은 저장 대신 라운드 종료 (총 타수를 확인하고 끝낸다).
/// 좌우로 밀어 홀을 옮긴다. 폰의 기록 모드 칸과 같은 규칙 (src/screens/HoleStatFields.tsx): 티샷은 파4·파5 만
/// (파3 티샷은 폰의 디테일 기록에만 있다. 워치는 그 값을 건드리지 않는다)
struct HoleView: View {
    @Environment(WatchStore.self) private var store
    let rec: HoleRecord
    let holeCount: Int

    @State private var par = 4
    @State private var rel: Int?
    @State private var putts: Int?
    @State private var dir: String?
    @State private var lie: String?
    @State private var ob = 0
    @State private var hazard = 0
    @State private var sand = 0
    /// 라운드 종료 확인 창
    @State private var finishAsk = false
    /// 라운드를 끝내지 못했을 때 안내
    @State private var finishError: String?

    private var strokes: Int? { rel.map { par + $0 } }
    private var draft: HoleRecord {
        HoleRecord(i: rec.i, par: par, rel: rel, putts: putts, dir: dir, lie: lie,
                   ob: ob, hazard: hazard, sand: sand, shotLies: rec.shotLies)
    }
    private var dirty: Bool { !matches(rec) }

    /// 지금 화면 값이 이 기록과 같은지
    private func matches(_ r: HoleRecord) -> Bool {
        par == r.par && rel == r.rel && putts == r.putts && dir == r.dir && lie == r.lie
            && ob == r.ob && hazard == r.hazard && sand == r.sand
    }

    var body: some View {
        VStack(spacing: 6) {
            topBar
                // 홀 번호를 시계 줄로 올려서 빈 위 막대 칸만큼 당긴다
                .padding(.top, -14)
            ScrollView {
                VStack(spacing: 8) {
                    StepperBlock(
                        title: "타수", value: strokes.map(String.init) ?? "–", note: scoreName, big: true,
                        canMinus: rel == nil || rel! > 1 - par, canPlus: rel == nil || rel! < par,
                        minus: { stepScore(-1) }, plus: { stepScore(1) }
                    )
                    StepperBlock(
                        title: "퍼트", value: putts.map(String.init) ?? "–", note: nil, big: true,
                        canMinus: (putts ?? 0) > 0, canPlus: putts == nil || putts! < puttMax,
                        minus: { stepPutts(-1) }, plus: { stepPutts(1) }
                    )
                    if par != 3 { teeBlock }
                    countBlock("OB", \.ob, key: "ob")
                    countBlock("해저드", \.hazard, key: "hazard")
                    countBlock("샌드샷", \.sand, key: "sand")
                    bottomAction
                    if store.workout.unavailable { healthNote }
                }
                .padding(.bottom, 6)
            }
        }
        // 홀 번호는 왼쪽 위, 오른쪽 위 시계와 같은 줄에 (위 막대 칸은 시계보다 조금 아래라 올려 맞춘다)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Text("\(rec.i + 1)번 홀")
                    .font(.app(18, .bold))
                    .foregroundStyle(Theme.accent)
                    .fixedSize()
                    .offset(y: -10)
            }
        }
        .alert(finishTitle, isPresented: $finishAsk) {
            if totals.missing.isEmpty {
                Button("라운드 종료", role: .destructive, action: finish)
            }
            if dirty {
                Button("저장만 하기", action: save)
            }
            Button("취소", role: .cancel) {}
        } message: {
            Text(finishMessage)
        }
        .alert(finishError ?? "", isPresented: Binding(get: { finishError != nil }, set: { if !$0 { finishError = nil } })) {
            Button("확인", role: .cancel) {}
        }
        .onAppear(perform: reset)
        // 서버에서 새로 읽어 바뀌면 (예전 값에서 손대지 않은 홀만) 따라간다. 폰에서 고친 홀도 이렇게 바뀐다
        .onChange(of: rec) { old, _ in
            if matches(old) { reset() }
        }
    }

    // MARK: - 위 (고정): 파 · 누적 타수

    private var topBar: some View {
        HStack(spacing: 6) {
            // 누르면 3 → 4 → 5. 파를 바꾸면 타수는 그 파부터 다시 (3 · 4 · 5)
            Button {
                par = par >= 5 ? 3 : par + 1
                rel = 0
                clamp()
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("PAR")
                        .font(.app(12, .heavy))
                        .foregroundStyle(.white.opacity(0.85))
                    Text("\(par)")
                        .font(.num(21))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .frame(minWidth: 70, minHeight: 40)
                .background(Capsule().fill(Theme.par(par)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("파 \(par), 눌러서 바꾸기")

            Spacer(minLength: 0)

            // 누적 타수 (파 대비, 지금 홀의 입력 포함)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("누적")
                    .font(.app(13, .heavy))
                    .foregroundStyle(.secondary)
                Text(totals.counted ? Self.relText(totals.rel) : "–")
                    .font(.num(30))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(minHeight: 40)
            .padding(.trailing, 4)
            .accessibilityElement(children: .combine)
        }
    }

    /// 파 대비 타수 글 (E · +13 · −2)
    static func relText(_ v: Int) -> String {
        v == 0 ? "E" : v > 0 ? "+\(v)" : "−\(-v)"
    }

    /// 라운드 합계 (지금 홀은 화면의 입력으로): 총 타수 · 총 파 · 파 대비, 타수가 없는 홀
    private var totals: (strokes: Int, par: Int, rel: Int, counted: Bool, missing: [Int]) {
        var strokes = 0, parSum = 0, relSum = 0, counted = false
        var missing: [Int] = []
        for h in store.round?.holes ?? [] {
            let hp = h.i == rec.i ? par : h.par
            let hr = h.i == rec.i ? rel : h.rel
            parSum += hp
            if let hr {
                strokes += hp + hr
                relSum += hr
                counted = true
            } else {
                missing.append(h.i + 1)
            }
        }
        return (strokes, parSum, relSum, counted, missing)
    }

    // MARK: - 아래: 저장 (마지막 홀은 라운드 종료)

    private var isLast: Bool { rec.i == holeCount - 1 }

    private var bottomAction: some View {
        Button {
            if isLast { finishAsk = true } else { save() }
        } label: {
            Text(isLast ? "라운드 종료" : saveLabel)
                .font(.app(17, .bold))
                .foregroundStyle(isLast ? .white : saveForeground)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(isLast ? Theme.finish : dirty ? Theme.accent : Theme.block)
                )
        }
        .buttonStyle(.plain)
        .disabled(!isLast && !dirty)
        .padding(.top, 4)
    }

    private var finishTitle: String {
        totals.missing.isEmpty ? "라운드를 끝낼까요?" : "타수가 없는 홀이 있어요"
    }

    private var finishMessage: String {
        let t = totals
        if t.missing.isEmpty {
            return "총 \(t.strokes)타 · 파 \(t.par) · \(Self.relText(t.rel))\n맞는지 확인해 주세요."
        }
        return "\(t.missing.map(String.init).joined(separator: " · "))번 홀 타수를 넣고 끝내 주세요."
    }

    /// 마지막 홀을 저장하고 라운드를 끝낸다 (방장만. 끝나면 골프 운동도 끝나 건강 앱에 저장된다)
    private func finish() {
        if dirty { store.save(draft) }
        Task {
            if let error = await store.finish() {
                finishError = error
            } else {
                WKInterfaceDevice.current().play(.success)
            }
        }
    }

    private var saveLabel: String {
        if dirty { return "저장" }
        if store.isPending(rec.i) { return "대기" }
        return rec.hasData ? "✓ 저장됨" : "저장"
    }

    private var saveForeground: Color {
        if dirty { return .white }
        if store.isPending(rec.i) { return Theme.pending }
        return rec.hasData ? Theme.saved : .secondary
    }

    // MARK: - 타수 · 퍼트

    /// 파 기준 이름 (보기 +1 · 파 · 버디 −1 …)
    private var scoreName: String? {
        guard let rel else { return nil }
        if par + rel == 1 { return "홀인원" }
        switch rel {
        case ...(-3): return "알바트로스"
        case -2: return "이글 −2"
        case -1: return "버디 −1"
        case 0: return "파"
        case 1: return "보기 +1"
        case 2: return "더블 +2"
        case 3: return "트리플 +3"
        default: return "+\(rel)"
        }
    }

    private func stepScore(_ d: Int) {
        // 처음 누르면 파부터
        let next = rel.map { $0 + d } ?? 0
        rel = min(max(next, 1 - par), par)
        clamp()
    }

    /// 퍼트는 6개까지, 타수보다 많을 수 없다
    private var puttMax: Int { min(6, strokes ?? 6) }

    private func stepPutts(_ d: Int) {
        // 처음 누르면 2퍼트부터
        let next = putts.map { $0 + d } ?? 2
        putts = min(max(next, 0), puttMax)
    }

    // MARK: - 티샷 (파4·파5): 방향 4칸 + 벙커 · OB · 해저드

    private static let dirOptions: [(id: String, icon: String, label: String)] = [
        ("left", "arrow.up.left", "훅"), ("hit", "circle", "페어웨이"), ("short", "arrow.down", "짧음"), ("right", "arrow.up.right", "슬라이스"),
    ]

    private static let lieOptions: [(id: String, label: String)] = [("bunker", "벙커"), ("ob", "OB"), ("hazard", "해저드")]

    private var teeNote: String? {
        let parts = [Self.dirOptions.first { $0.id == dir }?.label, Self.lieOptions.first { $0.id == lie }?.label].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var teeBlock: some View {
        Block {
            VStack(spacing: 6) {
                BlockTitle(title: "티샷", note: teeNote)
                HStack(spacing: 5) {
                    ForEach(Self.dirOptions, id: \.id) { o in
                        Button {
                            setDir(dir == o.id ? nil : o.id)
                        } label: {
                            Image(systemName: o.icon)
                                .font(.system(size: 17, weight: .bold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .background(RoundedRectangle(cornerRadius: 12).fill(dir == o.id ? Theme.accent : Theme.control))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(o.label)
                        .accessibilityAddTraits(dir == o.id ? .isSelected : [])
                    }
                }
                HStack(spacing: 5) {
                    ForEach(Self.lieOptions, id: \.id) { o in
                        Button {
                            setLie(lie == o.id ? nil : o.id)
                        } label: {
                            Text(o.label)
                                .font(.app(14, .semibold))
                                .frame(maxWidth: .infinity, minHeight: 40)
                                .background(RoundedRectangle(cornerRadius: 12).fill(lie == o.id ? Theme.accent : Theme.control))
                        }
                        .buttonStyle(.plain)
                        // 페어웨이에 떨어졌으면 고를 수 없다 (폰과 같다)
                        .disabled(dir == "hit")
                        .opacity(dir == "hit" ? 0.35 : 1)
                        .accessibilityAddTraits(lie == o.id ? .isSelected : [])
                    }
                }
            }
        }
    }

    private func setDir(_ next: String?) {
        dir = next
        // 페어웨이를 고르면 벙커·OB·해저드는 풀린다
        if next == "hit", lie != nil { setLie(nil) }
    }

    /// 티샷 결과를 바꾸면 아래 카운트도 따라간다: 풀거나 바꾼 것은 1 빼고, 새로 고른 것은 1 더한다
    private func setLie(_ next: String?) {
        if let old = lie { bump(old, -1) }
        if let new = next { bump(new, 1) }
        lie = next
    }

    private func bump(_ lie: String, _ d: Int) {
        switch lie {
        case "ob": ob = min(max(ob + d, 0), 9)
        case "hazard": hazard = min(max(hazard + d, 0), 9)
        case "bunker": sand = min(max(sand + d, 0), 9)
        default: break
        }
    }

    // MARK: - OB · 해저드 · 샌드샷

    /// 고른 벙커·OB·해저드 수 (티샷 + 폰의 디테일 기록 샷): 카운트는 이 아래로 내려가지 않는다
    private func floor(_ key: String) -> Int {
        let countOf = ["bunker": "sand", "ob": "ob", "hazard": "hazard"]
        return ([lie].compactMap { $0 } + rec.shotLies).filter { countOf[$0] == key }.count
    }

    private func countBlock(_ title: String, _ path: WritableKeyPath<HoleView.Counts, Int>, key: String) -> some View {
        let value = counts[keyPath: path]
        return StepperBlock(
            title: title, value: "\(value)", note: nil, big: false,
            canMinus: value > floor(key), canPlus: value < 9,
            minus: { setCount(path, value - 1) }, plus: { setCount(path, value + 1) }
        )
    }

    struct Counts {
        var ob: Int
        var hazard: Int
        var sand: Int
    }

    private var counts: Counts { Counts(ob: ob, hazard: hazard, sand: sand) }

    private func setCount(_ path: WritableKeyPath<Counts, Int>, _ value: Int) {
        var c = counts
        c[keyPath: path] = min(max(value, 0), 9)
        (ob, hazard, sand) = (c.ob, c.hazard, c.sand)
    }

    // MARK: - 골프 운동 (버튼 없이 저절로. 건강 권한이 없을 때만 알린다)

    private var healthNote: some View {
        Text("건강 권한이 없어 화면이 계속 떠 있지 않아요. 아이폰 건강 앱에서 멘탈게임을 허용해 주세요.")
            .font(.app(12))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 4)
    }

    // MARK: - 공통

    /// 파를 바꾸면 타수를 범위 안으로, 퍼트는 타수 이하로
    private func clamp() {
        if let r = rel { rel = min(max(r, 1 - par), par) }
        if let p = putts { putts = min(p, puttMax) }
    }

    private func reset() {
        par = rec.par
        rel = rec.rel
        putts = rec.putts
        dir = rec.dir
        lie = rec.lie
        (ob, hazard, sand) = (rec.ob, rec.hazard, rec.sand)
    }

    private func save() {
        let first = rec.rel == nil && rel != nil
        store.save(draft)
        WKInterfaceDevice.current().play(.success)
        // 이 홀 타수를 처음 넣었으면 다음 홀로 (폰과 같다)
        if first && rec.i < holeCount - 1 {
            withAnimation { store.hole = rec.i + 1 }
        }
    }
}

// MARK: - 블록

/// 항목 하나를 감싸는 둥근 남색 블록
struct Block<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 18).fill(Theme.block))
    }
}

/// 블록 위 작은 제목 (오른쪽에 지금 값 설명)
struct BlockTitle: View {
    let title: String
    let note: String?

    var body: some View {
        HStack {
            Text(title)
                .font(.app(13, .semibold))
                .foregroundStyle(.secondary)
            Spacer(minLength: 4)
            if let note {
                Text(note)
                    .font(.app(13, .semibold))
                    .foregroundStyle(Theme.accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .padding(.horizontal, 4)
    }
}

/// − 값 + 블록 (Hole19 처럼 블록 양쪽 끝에 큰 버튼). 항목 이름은 − 위, 설명(보기 +1 등)은 + 위
struct StepperBlock: View {
    let title: String
    let value: String
    let note: String?
    let big: Bool
    let canMinus: Bool
    let canPlus: Bool
    let minus: () -> Void
    let plus: () -> Void

    var body: some View {
        Block {
            HStack(alignment: .bottom, spacing: 0) {
                VStack(spacing: 3) {
                    caption(title, color: .secondary)
                    RoundButton(icon: "minus", label: "\(title) 하나 빼기", enabled: canMinus, action: minus)
                }
                .frame(width: RoundButton.size)
                Spacer(minLength: 4)
                Text(value)
                    .font(.num(big ? 32 : 26))
                    .monospacedDigit()
                    .frame(height: RoundButton.size)
                    .accessibilityLabel("\(title) \(value)\(note.map { ", \($0)" } ?? "")")
                Spacer(minLength: 4)
                VStack(spacing: 3) {
                    // 설명이 없어도 줄 높이는 남겨 − 쪽과 높이를 맞춘다
                    caption(note ?? " ", color: Theme.accent)
                    RoundButton(icon: "plus", label: "\(title) 하나 더하기", enabled: canPlus, action: plus)
                }
                .frame(width: RoundButton.size)
            }
        }
    }

    /// 버튼 위 작은 글씨: 버튼 가운데에 맞추고, 버튼보다 조금 넓게까지 쓰다가 더 길면 (알바트로스 등) 살짝 줄인다
    private func caption(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.app(13, .semibold))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(width: RoundButton.size + 16)
            .frame(width: RoundButton.size)
            .accessibilityHidden(true)
    }
}

/// 손가락 크기 동그란 버튼 (46pt)
struct RoundButton: View {
    static let size: CGFloat = 46
    let icon: String
    let label: String
    let enabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .bold))
                .frame(width: Self.size, height: Self.size)
                .background(Circle().fill(Theme.control))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
        .accessibilityLabel(label)
    }
}
