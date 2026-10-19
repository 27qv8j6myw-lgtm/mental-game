import { useState } from "react";
import type { BetRules, HandicapMode, PaymentMethod, SettleTiming } from "../types";
import { localDate, localTime, won } from "../util";
import { createRound } from "../rounds";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { Icon } from "../icons";
import { PaymentFields, RuleToggles } from "./RoundFields";

const UNITS = [1000, 2000, 5000];

export default function CreateRoundScreen({ onCancel }: { onCancel: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();

  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [teeTime, setTeeTime] = useState(() => localTime());
  const [unit, setUnit] = useState(1000);
  const [customUnit, setCustomUnit] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("transfer");
  const [handicapSettle, setHandicapSettle] = useState<SettleTiming>("post");
  const [handicapMode, setHandicapMode] = useState<HandicapMode>("avg");
  const [rules, setRules] = useState<BetRules>({
    parPenalty: true,
    doublePar: false,
    tie: false,
    birdieDouble: false,
  });

  const [holeCount, setHoleCount] = useState(18);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCustomUnit = !UNITS.includes(unit);
  const canSave = courseName.trim().length > 0 && unit > 0;

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const round = await createRound({
        courseName,
        date,
        teeTime,
        unit,
        rules: { ...rules, payment, handicapMode },
        handicapSettle,
        holeCount,
        me: {
          name: user?.displayName?.trim() || "나",
          gender: "male",
          avgScore: null,
          handicap: 0,
        },
      });
      openRound(round.id);
    } catch (e) {
      console.error(e);
      setErr("라운드 생성에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          라운드 만들기
        </div>
        <button className="icon-btn" onClick={onCancel}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="sheet">
        <div className="section-title">라운드 정보</div>
        <div className="card">
          <div className="field">
            <label>골프장 이름</label>
            <input
              className="input"
              placeholder="예) 베어크리크 춘천"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>
          <div className="row2">
            <div className="field">
              <label>날짜</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>티오프 시간</label>
              <input
                className="input"
                type="time"
                value={teeTime}
                onChange={(e) => setTeeTime(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>홀 수</label>
            <div className="segmented">
              {[9, 18].map((h) => (
                <button
                  key={h}
                  className={holeCount === h ? "active" : ""}
                  onClick={() => setHoleCount(h)}
                >
                  {h}홀
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="section-title">타당 금액</div>
        <div className="card">
          <div className="chips">
            {UNITS.map((u) => (
              <button
                key={u}
                className={`chip ${unit === u ? "active" : ""}`}
                onClick={() => {
                  setUnit(u);
                  setCustomUnit("");
                }}
              >
                {won(u)}
              </button>
            ))}
            <button
              className={`chip ${isCustomUnit ? "active" : ""}`}
              onClick={() => {
                const v = Number(customUnit) || 3000;
                setCustomUnit(String(v));
                setUnit(v);
              }}
            >
              직접입력
            </button>
          </div>
          {isCustomUnit && (
            <div className="field" style={{ marginTop: 12 }}>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                placeholder="금액 입력 (원)"
                value={customUnit}
                onChange={(e) => {
                  setCustomUnit(e.target.value);
                  setUnit(Number(e.target.value) || 0);
                }}
              />
            </div>
          )}
          <p className="warn-note">
            ⚠️ 과도한 금액 설정은 인간관계에 지장을 줄 수 있습니다.
          </p>
        </div>

        <div className="section-title">지불 방법</div>
        <div className="card">
          <PaymentFields
            payment={payment}
            settle={handicapSettle}
            onChange={(p, st) => {
              setPayment(p);
              setHandicapSettle(st);
            }}
          />
        </div>

        <div className="section-title">핸디캡 설정 방식</div>
        <div className="card">
          <div className="segmented">
            <button
              className={handicapMode === "avg" ? "active" : ""}
              onClick={() => setHandicapMode("avg")}
            >
              평균 타수 입력
            </button>
            <button
              className={handicapMode === "stroke" ? "active" : ""}
              onClick={() => setHandicapMode("stroke")}
            >
              기준인원 대비 +타
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {handicapMode === "avg"
              ? "각자 대기실에서 평균 타수를 입력하면 핸디(평균−72)가 자동 계산되고, ± 로 조정할 수 있어요."
              : "방장이 대기실에서 기준 인원을 정하고, 나머지는 기준보다 몇 타를 받을지(+5·+10·직접 입력) 고릅니다. 기준 인원을 정해야 시작할 수 있어요."}
          </p>
        </div>

        <div className="section-title">배판 규칙</div>
        <div className="card">
          <RuleToggles rules={rules} onChange={setRules} />
        </div>

        {err && (
          <div className="auth-err" style={{ color: "var(--loss)" }}>
            {err}
          </div>
        )}
      </div>

      <div className="actionbar">
        <button className="btn-primary" disabled={!canSave || busy} onClick={submit}>
          {busy ? "생성 중…" : "라운드 만들고 코드 받기"}
        </button>
      </div>
    </div>
  );
}
