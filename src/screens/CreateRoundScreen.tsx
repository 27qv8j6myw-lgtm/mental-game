import { useState } from "react";
import type { BetRules, SettleTiming } from "../types";
import { won } from "../util";
import { createRound } from "../rounds";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { Icon } from "../icons";

const UNITS = [1000, 2000, 5000];

export default function CreateRoundScreen({ onCancel }: { onCancel: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();

  const [courseName, setCourseName] = useState("");
  const [courseTee, setCourseTee] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [teeTime, setTeeTime] = useState("07:00");
  const [unit, setUnit] = useState(1000);
  const [customUnit, setCustomUnit] = useState("");
  const [handicapSettle, setHandicapSettle] = useState<SettleTiming>("post");
  const [rules, setRules] = useState<BetRules>({
    parPenalty: true,
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
      const firstName = (user?.displayName ?? "").split(" ")[0] || "나";
      const round = await createRound({
        courseName,
        courseTee,
        date,
        teeTime,
        unit,
        rules,
        handicapSettle,
        holeCount,
        me: { name: firstName, gender: "male", avgScore: null, handicap: 0 },
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
          <div className="field">
            <label>코스</label>
            <input
              className="input"
              placeholder="예) OUT 코스"
              value={courseTee}
              onChange={(e) => setCourseTee(e.target.value)}
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

        <div className="section-title">핸디캡 정산</div>
        <div className="card">
          <div className="segmented">
            <button
              className={handicapSettle === "pre" ? "active" : ""}
              onClick={() => setHandicapSettle("pre")}
            >
              사전 정산
            </button>
            <button
              className={handicapSettle === "post" ? "active" : ""}
              onClick={() => setHandicapSettle("post")}
            >
              사후 정산
            </button>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            참여자 각자가 대기실에서 본인 핸디를 입력하며, 핸디 차이는 자동
            계산됩니다.
          </p>
        </div>

        <div className="section-title">배판 규칙</div>
        <div className="card">
          <div className="toggle-row" onClick={() => setRules((r) => ({ ...r, parPenalty: !r.parPenalty }))}>
            <div className="tinfo">
              <span className="t">파 페널티 배판 (동시 규칙)</span>
              <span className="s">파3 더블보기+ · 파4·5 트리플보기+ 이면 배판</span>
            </div>
            <div className={`switch ${rules.parPenalty ? "on" : ""}`} />
          </div>
          <div className="toggle-row" onClick={() => setRules((r) => ({ ...r, birdieDouble: !r.birdieDouble }))}>
            <div className="tinfo">
              <span className="t">버디 배판</span>
              <span className="s">버디(-1) 이상이 나온 홀은 배판 (한 타 추가 정산 없음)</span>
            </div>
            <div className={`switch ${rules.birdieDouble ? "on" : ""}`} />
          </div>
          <div className="toggle-row" onClick={() => setRules((r) => ({ ...r, tie: !r.tie }))}>
            <div className="tinfo">
              <span className="t">동타 배판</span>
              <span className="s">3명(3인 플레이 시 2명) 이상 같은 스코어면 배판</span>
            </div>
            <div className={`switch ${rules.tie ? "on" : ""}`} />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            <Icon name="birdie" size={13} className="inline-ic" /> 배판은 서로 중복되지
            않고 <b>최대 2배</b>까지만 적용됩니다. 버디 배판을 끄면 버디 시 홀마다 한
            타를 더 잡아주는 추가 정산이 적용됩니다. 전원 동타 홀은 다음 홀로 이월되어
            배판이 됩니다.
          </p>
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
