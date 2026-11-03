import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { courseCoords, deviceCoords, roundForecast, type ForecastHour } from "../weather";
import type { RoundRow } from "../types";

/*
 * 대기실 초대 코드 카드의 날씨: 티오프부터 5시간 예보로 애플 날씨 같은 하늘 장면을 깔고,
 * 오른쪽에 날씨·기온(시작 → 끝)·습도·자외선을 보여 준다. 장면은 방콕여행 앱(WeatherScene)에서 가져왔다.
 * 좌표: KGA 목록에서 고른 골프장은 그 좌표, 아니면 폰의 대략적인 위치 (weather.ts deviceCoords).
 * 국내 폰 위치는 기상청 예보라 자외선이 없다
 */

export type SceneKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

/** WMO 날씨 코드 → 장면 */
export function sceneKind(code: number): SceneKind {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain"; // 이슬비 · 비
  if (code <= 77) return "snow";
  if (code <= 82) return "rain"; // 소나기
  if (code <= 86) return "snow"; // 눈 소나기
  return "storm";
}

const SEVERITY: SceneKind[] = ["clear", "partly", "cloudy", "fog", "snow", "rain", "storm"];

export function weatherLabel(code: number): string {
  if (code === 0) return "맑음";
  if (code <= 2) return "구름 조금";
  if (code === 3) return "흐림";
  if (code <= 48) return "안개";
  if (code <= 57) return "이슬비";
  if (code <= 67) return "비";
  if (code <= 77) return "눈";
  if (code <= 82) return "소나기";
  if (code <= 86) return "눈 소나기";
  return "뇌우";
}

function uvLevel(uv: number): string {
  if (uv < 3) return "낮음";
  if (uv < 6) return "보통";
  if (uv < 8) return "높음";
  if (uv < 11) return "매우 높음";
  return "위험";
}

export interface ForecastSummary {
  kind: SceneKind;
  isDay: boolean;
  label: string;
  /** 티오프 정시 · 5시간 뒤 */
  start: ForecastHour;
  end: ForecastHour;
  uvMax: number | null;
  /** 라운드 중 가장 높은 강수확률 */
  precipMax: number | null;
}

/**
 * 장면·날씨: 라운드 중 두 시간 넘게 이어지는 가장 궂은 날씨 (비가 잠깐 지나가는 정도면 티오프 날씨)
 */
export function forecastSummary(hours: ForecastHour[]): ForecastSummary | null {
  if (hours.length < 2) return null;
  const start = hours[0];
  const end = hours[hours.length - 1];
  const rank = (code: number) => SEVERITY.indexOf(sceneKind(code));
  const lasting = hours.filter((h) => hours.filter((x) => rank(x.code) === rank(h.code)).length >= 2);
  const main = lasting.reduce((a, h) => (rank(h.code) > rank(a.code) ? h : a), lasting[0] ?? start);
  const max = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.max(...v) : null;
  };
  return {
    kind: sceneKind(main.code),
    isDay: start.isDay,
    label: weatherLabel(main.code),
    start,
    end,
    uvMax: max(hours.map((h) => h.uv)),
    precipMax: max(hours.map((h) => h.precip)),
  };
}

/**
 * 대기실 라운드의 티오프 5시간 예보 (라운드가 없거나 좌표를 못 구했거나 예보 기간 밖이면 null).
 * 라운드 일기처럼 지난 라운드면 device: false (그날 폰 위치는 남기지 않아 골프장 좌표가 있을 때만)
 */
export function useRoundForecast(
  round: Pick<RoundRow, "id" | "date" | "tee_time" | "rules"> | null | undefined,
  { device = true }: { device?: boolean } = {}
): ForecastSummary | null {
  const [sum, setSum] = useState<ForecastSummary | null>(null);
  const date = round?.date ?? "";
  const time = round?.tee_time ?? "";
  const rules = round?.rules;
  const club = rules?.rating?.club ?? "";
  useEffect(() => {
    setSum(null);
    if (!rules || !date || !/^\d{1,2}:\d{2}$/.test(time)) return;
    let alive = true;
    void (async () => {
      // KGA 목록 골프장은 그 좌표, 아니면 폰의 대략적인 위치 (허락할 때만)
      const course = await courseCoords(rules);
      const at = course ?? (device ? await deviceCoords() : null);
      if (!at || !alive) return;
      const hours = await roundForecast(at, course ? "course" : "device", date, time, `${round?.id}|${club}`);
      if (alive) setSum(forecastSummary(hours));
    })().catch((e) => console.warn("예보를 받지 못함", e));
    return () => {
      alive = false;
    };
    // 골프장·날짜·티오프가 바뀔 때만 다시 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id, club, date, time]);
  return sum;
}

const deg = (t: number) => `${Math.round(t)}°`;
/** 끝 시각이 자정이면 '0시' 대신 '24시' (밤 라운드) */
const hourOf = (stamp: string, end = false) => `${Number(stamp.slice(11, 13)) || (end ? 24 : 0)}시`;

/** 카드 오른쪽: 날씨 / 기온 시작 → 끝 (아래에 그 시각) / 습도·자외선·강수 표 */
export function ForecastSide({ f }: { f: ForecastSummary }) {
  const h0 = f.start.humidity;
  const h1 = f.end.humidity;
  const stats: [string, ReactNode][] = [];
  if (h0 != null) {
    const moved = h1 != null && Math.abs(h1 - h0) >= 5;
    stats.push([
      "습도",
      moved ? (
        <>
          {Math.round(h0)}
          <i>→</i>
          {Math.round(h1!)}%
        </>
      ) : (
        `${Math.round(h0)}%`
      ),
    ]);
  }
  // 밤 라운드처럼 자외선이 없으면 뺀다
  if (f.uvMax != null && f.uvMax >= 1) {
    stats.push([
      "자외선",
      <>
        {Math.round(f.uvMax)} <small>{uvLevel(f.uvMax)}</small>
      </>,
    ]);
  }
  if (f.precipMax != null && f.precipMax >= 30) stats.push(["강수", `${f.precipMax}%`]);
  return (
    <div className="wx-side">
      <div className="wx-cond">{f.label}</div>
      <div className="wx-temps">
        <b>{deg(f.start.temp)}</b>
        <i>→</i>
        <b>{deg(f.end.temp)}</b>
        <span>{hourOf(f.start.time)}</span>
        <span />
        <span>{hourOf(f.end.time, true)}</span>
      </div>
      {stats.length > 0 && (
        <dl className="wx-stats">
          {stats.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

/* ---------- 하늘 장면 (방콕여행 앱 WeatherScene) ---------- */

/** 결정적 의사난수 (0 ≤ r < 1): 렌더마다 빗방울·별 위치가 흔들리지 않게 */
function spread(index: number, seed: number): number {
  const x = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** 구름 한 덩이를 이루는 뭉게 (200×100 기준 좌표) */
const PUFFS: { x: number; y: number; size: number }[] = [
  { x: 0, y: 40, size: 70 },
  { x: 34, y: 14, size: 92 },
  { x: 88, y: 4, size: 104 },
  { x: 138, y: 30, size: 78 },
  { x: 20, y: 46, size: 150 },
  { x: 92, y: 42, size: 120 },
];

function Clouds({ count, top, slow }: { count: number; top: number; slow: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const scale = 0.75 + spread(i, 1) * 0.85;
        return (
          <div
            key={i}
            className="wx-cloud"
            style={
              {
                "--top": `${-6 + spread(i, 2) * top}%`,
                "--scale": scale.toFixed(2),
                "--dur": `${(slow ? 110 : 80) + spread(i, 3) * 70}s`,
                "--delay": `${-spread(i, 4) * 150}s`,
                "--alpha": (0.55 + scale * 0.3).toFixed(2),
                // 모션 줄이기 설정에서 멈춰 둘 자리
                "--rest": `${-140 - spread(i, 15) * 420}px`,
              } as Vars
            }
          >
            {PUFFS.map((puff, j) => (
              <span
                key={j}
                className="wx-puff"
                style={{ left: puff.x, top: puff.y, width: puff.size, height: puff.size * 0.82 }}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function Rain({ count, heavy, snow }: { count: number; heavy: boolean; snow?: boolean }) {
  return (
    <div className={`wx-rain ${snow ? "snow" : ""}`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="wx-drop"
          style={
            {
              "--x": `${spread(i, 5) * 100}%`,
              "--delay": `${-spread(i, 6) * (snow ? 9 : 2)}s`,
              "--dur": `${snow ? 6 + spread(i, 7) * 5 : (heavy ? 0.5 : 0.75) + spread(i, 7) * 0.35}s`,
              "--len": `${snow ? 3 + spread(i, 8) * 3 : (heavy ? 26 : 18) + spread(i, 8) * 16}px`,
              "--alpha": (snow ? 0.5 + spread(i, 9) * 0.4 : 0.14 + spread(i, 9) * 0.34).toFixed(2),
            } as Vars
          }
        />
      ))}
    </div>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="wx-star"
          style={
            {
              "--x": `${spread(i, 10) * 100}%`,
              "--y": `${spread(i, 11) * 55}%`,
              "--size": `${0.8 + spread(i, 12) * 1.5}px`,
              "--dur": `${2.5 + spread(i, 13) * 4}s`,
              "--delay": `${-spread(i, 14) * 6}s`,
            } as Vars
          }
        />
      ))}
    </>
  );
}

export function WeatherScene({ kind, isDay }: { kind: SceneKind; isDay: boolean }) {
  const clearish = kind === "clear" || kind === "partly";
  const overcast = kind === "cloudy" || kind === "rain" || kind === "snow" || kind === "storm";
  return (
    <div className="wx-scene" aria-hidden>
      {!isDay && clearish && <Stars count={kind === "clear" ? 46 : 24} />}
      {isDay && clearish && (
        <div className="wx-sun">
          <div className="wx-sun-glow" />
          <div className="wx-sun-shimmer" />
          <div className="wx-sun-core" />
        </div>
      )}
      {!isDay && clearish && (
        <div className="wx-moon">
          <div className="wx-moon-glow" />
          <div className="wx-moon-core" />
        </div>
      )}
      {overcast && <div className="wx-overcast" />}
      {kind === "partly" && <Clouds count={3} top={26} slow={false} />}
      {overcast && <Clouds count={kind === "cloudy" ? 6 : 7} top={22} slow />}
      {kind === "fog" &&
        [0, 1, 2, 3].map((i) => <span key={i} className="wx-mist" style={{ "--i": i } as Vars} />)}
      {kind === "rain" && <Rain count={70} heavy={false} />}
      {kind === "snow" && <Rain count={46} heavy={false} snow />}
      {kind === "storm" && (
        <>
          <Rain count={90} heavy />
          <div className="wx-flash" />
        </>
      )}
    </div>
  );
}
