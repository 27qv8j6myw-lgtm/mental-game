import type { BetRules, PaymentMethod, SettleTiming } from "../types";
import { settleNote } from "../util";
import { Icon } from "../icons";

/** 지불 방법 + 핸디캡 정산 시점. 현금 지급은 사전 정산만 가능하다. */
export function PaymentFields({
  payment,
  settle,
  onChange,
}: {
  payment: PaymentMethod;
  settle: SettleTiming;
  onChange: (payment: PaymentMethod, settle: SettleTiming) => void;
}) {
  return (
    <>
      <div className="segmented">
        <button
          className={payment === "cash" ? "active" : ""}
          onClick={() => onChange("cash", "pre")}
        >
          현금 지급
        </button>
        <button
          className={payment === "transfer" ? "active" : ""}
          onClick={() => onChange("transfer", "post")}
        >
          계좌이체
        </button>
      </div>

      <div className="sub-field">
        <label>핸디캡 정산</label>
        <div className="segmented sm">
          <button
            className={settle === "pre" ? "active" : ""}
            onClick={() => onChange(payment, "pre")}
          >
            사전 정산
          </button>
          <button
            className={settle === "post" ? "active" : ""}
            disabled={payment === "cash"}
            onClick={() => onChange(payment, "post")}
          >
            사후 정산
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {settleNote(settle)}
          {payment === "cash" && " (현금 지급은 사전 정산만 가능해요)"}
        </p>
      </div>
    </>
  );
}

/** 배판 규칙 토글. 파 페널티와 더블파는 한쪽을 켜면 다른 쪽이 꺼진다. */
export function RuleToggles({
  rules,
  onChange,
}: {
  rules: BetRules;
  onChange: (rules: BetRules) => void;
}) {
  const togglePenalty = (key: "parPenalty" | "doublePar") => {
    const on = !rules[key];
    const other = key === "parPenalty" ? "doublePar" : "parPenalty";
    onChange({ ...rules, [key]: on, [other]: on ? false : rules[other] });
  };

  return (
    <>
      <div className="toggle-row" onClick={() => togglePenalty("parPenalty")}>
        <div className="tinfo">
          <span className="t">파 페널티 배판 (동시 규칙)</span>
          <span className="s">파3 더블보기+ · 파4·5 트리플보기+ 이면 배판</span>
        </div>
        <div className={`switch ${rules.parPenalty ? "on" : ""}`} />
      </div>
      <div className="toggle-row" onClick={() => togglePenalty("doublePar")}>
        <div className="tinfo">
          <span className="t">더블파 배판</span>
          <span className="s">더블파(파의 2배 타수) 이상이 나오면 배판 · 파 페널티와 택1</span>
        </div>
        <div className={`switch ${rules.doublePar ? "on" : ""}`} />
      </div>
      <div
        className="toggle-row"
        onClick={() => onChange({ ...rules, birdieDouble: !rules.birdieDouble })}
      >
        <div className="tinfo">
          <span className="t">버디 배판</span>
          <span className="s">버디(-1) 이상이 나온 홀은 배판 (한 타 추가 정산 없음)</span>
        </div>
        <div className={`switch ${rules.birdieDouble ? "on" : ""}`} />
      </div>
      <div className="toggle-row" onClick={() => onChange({ ...rules, tie: !rules.tie })}>
        <div className="tinfo">
          <span className="t">동타 배판</span>
          <span className="s">3명(3인 플레이 시 2명) 이상 같은 스코어면 배판</span>
        </div>
        <div className={`switch ${rules.tie ? "on" : ""}`} />
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        <Icon name="birdie" size={13} className="inline-ic" /> 배판은 서로 중복되지 않고{" "}
        <b>최대 2배</b>까지만 적용됩니다. 버디 배판을 끄면 버디 시 홀마다 한 타를 더 잡아주는
        추가 정산이 적용됩니다. 전원 동타 홀은 다음 홀로 이월되어 배판이 됩니다.
      </p>
    </>
  );
}
