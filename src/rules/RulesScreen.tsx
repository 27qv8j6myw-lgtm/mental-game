import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useBack } from "../back";
import { Icon } from "../icons";
import TopBar, { BackButton } from "../screens/TopBar";
import { RuleFigure } from "./figures";
import { RULES, type Rule } from "./list";

/*
 * 자주 틀리는 골프 룰: 한 쪽에 룰 하나 (그림 + 자세한 설명). 좌우로 밀어 넘긴다 (가로 스크롤 맞춤).
 * 쪽마다 따로 세로로 스크롤한다. 위 '목록'으로 바로 갈 수 있다
 */

interface Page {
  /** 이렇게 해요 */
  points: ReactNode[];
  /** 자주 하는 실수 */
  mistake?: ReactNode;
}

const PAGES: Record<string, Page> = {
  tee: {
    points: [
      "티잉 구역은 같은 색 티 마커 두 개로 정해요. 티 마커는 티 박스에 놓인 색깔 표시예요.",
      "두 티 마커의 앞쪽 끝을 이은 선이 맨 앞이에요.",
      "그 선에서 뒤로 두 클럽 길이까지가 티잉 구역이에요.",
      "공만 구역 안에 있으면 돼요. 몸은 밖에 서도 괜찮아요.",
    ],
    mistake: "티 마커 선보다 앞에 티를 꽂고 치면 2벌타예요. 그 샷은 세지 않고, 구역 안에서 다시 쳐요.",
  },
  ob: {
    points: [
      "OB는 흰 말뚝이나 흰 선으로 표시해요.",
      "공 전체가 선 밖으로 나가야 OB예요. 조금이라도 선에 걸치면 살아 있어요.",
      "1벌타를 받고 직전에 친 곳에서 다시 쳐요.",
      "티샷이 OB면 티잉 구역에서 세 번째 샷을 쳐요.",
    ],
    mistake: "OB티(특설 티)는 골프장이 정한 로컬룰이에요. OB티에서 치면 네 번째 샷이에요. 정식 룰은 친 곳에서 다시 치기예요.",
  },
  provisional: {
    points: [
      "치기 전에 동반자에게 \"잠정구 칠게요\"라고 말해요.",
      "\"하나 더 칠게요\"처럼 말하면 잠정구가 아니에요.",
      "말하지 않고 친 공은 바로 내 공이 돼요(1벌타). 원구는 찾아도 칠 수 없어요.",
      "원구를 찾으러 앞으로 나가기 전에 쳐야 해요.",
      "페널티 구역에만 있을 것 같으면 잠정구를 칠 수 없어요.",
    ],
    mistake: "걱정돼서 한 개 더 치면서 아무 말도 안 하는 경우가 많아요.",
  },
  "provisional-play": {
    points: [
      "원구를 3분 안에 못 찾거나 OB면 잠정구가 내 공이 돼요(1벌타).",
      "원구가 있을 것 같은 곳보다 홀에 가까운 곳에서 잠정구를 쳐도 내 공이 돼요.",
      "그 뒤에는 원구를 찾아도 칠 수 없어요. 원구를 치면 다른 공을 친 것이라 2벌타가 더해져요.",
      "원구보다 뒤에서 잠정구를 친 건 괜찮아요. 원구를 찾으면 원구로 계속 쳐요.",
    ],
    mistake: "원구를 찾았는데 잠정구 자리가 더 좋다고 잠정구로 치면 안 돼요. 원구를 찾으면 원구로 쳐야 해요.",
  },
  search: {
    points: [
      "나나 캐디가 공을 찾기 시작한 때부터 재요.",
      "3분 안에 못 찾으면 분실이에요. 1벌타를 받고 친 곳에서 다시 쳐요.",
      "3분이 지난 뒤에 찾은 공은 칠 수 없어요.",
      "찾다가 실수로 공을 건드려 움직여도 벌타는 없어요. 제자리에 두고 쳐요.",
    ],
    mistake: "예전 규칙대로 5분으로 아는 경우가 많아요. 지금은 3분이에요.",
  },
  "wrong-ball": {
    points: [
      "다른 사람 공으로 친 타수는 세지 않아요.",
      "2벌타를 받고 내 공을 찾아서 쳐야 해요.",
      "다음 홀 티샷 전까지 바로잡지 않으면 실격이에요.",
      "치기 전에 내 공인지 확인해요. 공에 내 표시를 해 두면 좋아요.",
    ],
    mistake: "같은 브랜드, 같은 번호 공을 쓰다가 바뀌는 경우가 많아요.",
  },
  "ball-moved": {
    points: [
      "바람이나 경사로 저절로 움직이면 벌타 없이 멈춘 자리에서 쳐요.",
      "내가 건드려 움직이면 1벌타를 받고 원래 자리에 다시 놓아요.",
      "공을 찾다가, 또는 그린 위에서 실수로 움직인 건 벌타 없이 원래 자리에 놓아요.",
      "동반자나 다른 공이 움직이면 벌타 없이 원래 자리에 놓아요.",
      "그린에서 마크하고 다시 놓은 공이 저절로 움직이면 원래 자리에 다시 놓아요.",
    ],
    mistake: "어드레스 뒤에 공이 움직였다고 다 1벌타는 아니에요. 내가 움직이게 한 게 확실할 때만 1벌타예요.",
  },
  "improve-lie": {
    points: [
      "클럽으로 공 뒤 풀을 꾹 눌러 다지면 안 돼요.",
      "나뭇가지를 꺾거나 휘어서 스윙 길을 내면 안 돼요.",
      "발로 공 주변을 밟아 다지거나 디봇 자국을 메워도 안 돼요.",
      "클럽을 공 바로 뒤에 가볍게 대는 건 괜찮아요.",
      "나뭇잎·돌 같은 자연물은 치워도 돼요.",
    ],
    mistake: "연습 스윙으로 공 뒤 풀을 쳐서 눕히는 경우가 많아요. 이것도 라이 개선이라 2벌타예요.",
  },
  divot: {
    points: [
      "디봇 자국은 수리지가 아니에요. 있는 그대로 쳐야 해요.",
      "치기 전에 디봇 자국을 메우거나 모래를 고르면 2벌타예요.",
      "치기 어려우면 언플레이어블로 1벌타를 받고 빼요.",
      "골프장이 수리지로 정한 곳이면 벌타 없이 뺄 수 있어요.",
    ],
    mistake: "\"디봇이니까 빼고 칠게요\" 하고 벌타 없이 옮기는 경우가 많아요.",
  },
  embedded: {
    points: [
      "공이 떨어지며 만든 자국에 박혀 일부가 땅 아래에 있을 때예요.",
      "공을 집어서 닦아도 돼요.",
      "박힌 곳 바로 뒤 지점에서 한 클럽 이내, 홀에 가깝지 않게 드롭해요.",
      "페어웨이·러프 모두 돼요. 벙커와 페널티 구역은 안 돼요.",
    ],
    mistake: "벙커 모래에 박힌 공(에그 프라이)은 벌타 없이 뺄 수 없어요.",
  },
  "pa-play": {
    points: [
      "빨간·노란 말뚝이나 선 안쪽이 페널티 구역이에요. 물이 없어도 페널티 구역일 수 있어요.",
      "공이 있는 그대로 치면 벌타가 없어요.",
      "치기 전에 클럽을 땅이나 물에 대도 되고, 나뭇잎·돌도 치워도 돼요.",
      "칠 수 없으면 1벌타를 받고 빼고 쳐요. 방법은 말뚝 색마다 달라요.",
    ],
    mistake: "OB와 헷갈리지 마세요. OB는 공을 찾아도 칠 수 없지만, 페널티 구역은 공이 있는 곳에서 쳐도 돼요.",
  },
  "pa-yellow": {
    points: [
      "공이 마지막으로 경계선을 넘어간 지점을 정해요. 처음 넘어간 곳이 아니에요.",
      "홀과 그 지점을 잇는 직선을 뒤로 늘려요.",
      "그 선 위에 기준점을 정하고, 거기서 한 클럽 이내에 드롭해요. 얼마나 뒤로 가든 괜찮아요.",
      "또는 1벌타를 받고 직전에 친 곳에서 다시 쳐요.",
    ],
    mistake: "노란 말뚝은 넘어간 지점 옆에 드롭할 수 없어요. 옆(두 클럽)은 빨간 말뚝만 돼요.",
  },
  "pa-red": {
    points: [
      "1벌타를 받고, 공이 마지막으로 경계를 넘어간 지점에서 두 클럽 이내에 드롭해요.",
      "홀에 가까워지면 안 되고, 페널티 구역 밖이어야 해요.",
      "노란 말뚝처럼 넘어간 지점과 홀을 잇는 선의 뒤쪽에 드롭해도 돼요.",
      "직전에 친 곳에서 다시 쳐도 돼요.",
    ],
    mistake: "물 건너 반대편으로 가서 드롭하면 안 돼요. 예전 규칙이에요.",
  },
  unplayable: {
    points: [
      "나무 밑, 덤불 속처럼 치기 어려울 때 내가 선언해요. 동반자가 정하지 않아요.",
      "페널티 구역만 빼고 코스 어디서나 할 수 있어요.",
      "1벌타를 받고 셋 중 하나를 골라요.",
      "① 공에서 두 클럽 이내, 홀에 가깝지 않은 곳",
      "② 홀과 공을 잇는 직선의 뒤쪽",
      "③ 직전에 친 곳에서 다시",
    ],
    mistake: "\"빼고 칠게요\" 하고 벌타 없이 치는 경우가 많아요. 빼는 순간 1벌타예요.",
  },
  "cart-path": {
    points: [
      "공이 도로 위에 있거나, 서는 자리나 스윙이 도로에 걸리면 뺄 수 있어요.",
      "도로 가운데 선을 기준으로 공이 있는 쪽 가장자리가 보통 가까운 쪽이에요.",
      "공과 발이 모두 도로를 벗어나는 가장 가까운 지점을 찾아요. 발 위치 때문에 반대쪽이 더 가까울 수도 있어요.",
      "그 지점에서 한 클럽 이내, 홀에 가깝지 않게 드롭해요.",
      "빼지 않고 그대로 쳐도 돼요.",
    ],
    mistake: "더 좋은 쪽을 골라 빼면 안 돼요. 가장 가까운 지점이 러프 쪽이면 러프로 빼요.",
  },
  "wrong-green": {
    points: [
      "공이 다른 홀 그린에 조금이라도 닿거나, 서는 자리가 그린에 걸리면 빼야 해요.",
      "그린을 완전히 벗어나는 가장 가까운 지점을 찾아요. 홀에 가까워지면 안 돼요.",
      "그 지점에서 한 클럽 이내에 드롭해요. 벌타는 없어요.",
      "연습 그린도 다른 그린이에요.",
    ],
    mistake: "옆 그린 위에서 그대로 치면 2벌타예요.",
  },
  drop: {
    points: [
      "무릎 높이에서 공을 똑바로 떨어뜨려요. 던지거나 굴리면 안 돼요.",
      "어떤 구제든 홀에 가까워지면 안 돼요.",
      "공이 드롭한 구역 안에 멈춰야 해요. 밖으로 굴러가면 한 번 더 드롭해요.",
      "두 번째도 밖으로 나가면, 두 번째에 공이 처음 땅에 닿은 곳에 놓아요.",
    ],
    mistake: "어깨 높이에서 드롭하는 건 예전 방식이에요. 그대로 치면 1벌타예요.",
  },
  "bunker-sand": {
    points: [
      "어드레스 때 클럽을 공 바로 앞뒤 모래에 대면 안 돼요.",
      "연습 스윙으로 모래를 쳐도 2벌타예요.",
      "백스윙 때 모래에 닿아도 2벌타예요.",
      "나뭇잎·돌·솔방울은 치워도 돼요. 치우다 공이 움직이면 1벌타예요.",
    ],
    mistake: "습관처럼 클럽을 모래에 대고 어드레스하는 경우가 많아요.",
  },
  "bunker-unplayable": {
    points: [
      "1벌타: 공에서 두 클럽 이내에 드롭해요. 벙커 안이어야 해요.",
      "1벌타: 홀과 공을 잇는 선의 뒤쪽에 드롭해요. 이것도 벙커 안이어야 해요.",
      "1벌타: 직전에 친 곳에서 다시 쳐도 돼요.",
      "2벌타: 홀과 공을 잇는 선의 뒤쪽, 벙커 밖에 드롭해요.",
    ],
    mistake: "1벌타만 받고 벙커 옆 잔디로 빼면 안 돼요. 벙커 밖으로 나가면 2벌타예요.",
  },
  flagstick: {
    points: [
      "그린 위에서 쳐도 깃대를 그대로 둘 수 있어요.",
      "공이 깃대에 맞고 들어가도 홀인이에요.",
      "빼고 치고 싶으면 치기 전에 빼 달라고 해요.",
    ],
    mistake: "그린에서 깃대를 맞히면 2벌타라는 건 예전 규칙이에요.",
  },
  advice: {
    points: [
      "클럽 선택, 치는 방법 같은 조언을 동반자에게 물으면 안 돼요.",
      "알려 준 사람도 2벌타예요.",
      "내 캐디에게 묻는 건 괜찮아요.",
      "거리, 해저드 위치, 룰은 물어봐도 돼요.",
      "동반자 가방 속 클럽을 보는 것만은 괜찮아요. 만지거나 덮개를 들추면 안 돼요.",
    ],
    mistake: "친선 라운드에서 가볍게 묻는 경우가 많아요. 정식 룰로는 묻는 사람, 알려 준 사람 모두 2벌타예요.",
  },
};

function PenaltyTag({ rule }: { rule: Rule }) {
  return <span className={`rl-pen ${rule.penalty.tone}`}>{rule.penalty.label}</span>;
}

function RulePage({ rule, index, near }: { rule: Rule; index: number; near: boolean }) {
  const page = PAGES[rule.id];
  return (
    <article className="rl-page" aria-label={`${index + 1}. ${rule.title}`}>
      <div className="rl-meta">
        <PenaltyTag rule={rule} />
        <span className="rl-ref">규칙 {rule.ref}</span>
      </div>
      <h2 className="rl-title">{rule.title}</h2>
      <p className="rl-lead">{rule.lead}</p>
      <RuleFigure id={rule.id} alt={`${rule.title}: ${rule.lead}`} eager={near} />
      <ul className="rl-points">
        {page.points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      {page.mistake && (
        <div className="rl-mistake">
          <b>자주 하는 실수</b>
          <p>{page.mistake}</p>
        </div>
      )}
      <p className="rl-source">골프 규칙 2023년판 (R&A·USGA) 기준</p>
    </article>
  );
}

export default function RulesScreen({ onClose, start = 0 }: { onClose: () => void; start?: number }) {
  const pager = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [listOpen, setListOpen] = useState(false);
  const indexRef = useRef(start);
  indexRef.current = index;
  useBack(true, onClose);
  useBack(listOpen, () => setListOpen(false));

  const goTo = useCallback((i: number, smooth = true) => {
    const el = pager.current;
    if (!el) return;
    const n = Math.max(0, Math.min(RULES.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    // 바로 옮길 때는 스크롤 이벤트가 오지 않을 수 있어 쪽 번호를 직접 맞춘다
    setIndex(n);
  }, []);

  // 처음 연 쪽으로 (밀어 넘기는 효과 없이)
  useLayoutEffect(() => {
    const el = pager.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);

  // 화면 폭이 바뀌면(회전·펼침) 보던 쪽을 그대로
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.scrollLeft = indexRef.current * el.clientWidth;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 키보드 ← → (넓은 화면)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goTo(indexRef.current - 1);
      if (e.key === "ArrowRight") goTo(indexRef.current + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const onScroll = () => {
    const el = pager.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== indexRef.current) setIndex(i);
  };

  return (
    <div className="guide-layer rl-layer" role="dialog" aria-modal="true" aria-label="자주 틀리는 골프 룰">
      <div className="guide-inner rl-inner">
        <TopBar
          left={<BackButton onClick={listOpen ? () => setListOpen(false) : onClose} />}
          right={
            <button className="rl-list-btn" onClick={() => setListOpen((v) => !v)}>
              {listOpen ? "닫기" : "목록"}
            </button>
          }
        />
        <div className="rl-body">
          <div className="rl-pager" ref={pager} onScroll={onScroll}>
            {RULES.map((r, i) => (
              <RulePage key={r.id} rule={r} index={i} near={Math.abs(i - index) <= 1} />
            ))}
          </div>
          {listOpen && (
            <div className="rl-list">
              <div className="rl-list-head">자주 틀리는 골프 룰 {RULES.length}가지</div>
              <div className="card rl-list-card">
                {RULES.map((r, i) => (
                  <button
                    key={r.id}
                    className={`rl-list-row ${i === index ? "on" : ""}`}
                    onClick={() => {
                      setListOpen(false);
                      goTo(i, false);
                    }}
                  >
                    <span className="rl-list-no">{i + 1}</span>
                    <span className="rl-list-main">
                      <b>{r.title}</b>
                      <span>{r.short}</span>
                    </span>
                    <PenaltyTag rule={r} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {!listOpen && (
          <div className="rl-foot">
            <button className="rl-nav" aria-label="이전 룰" disabled={index === 0} onClick={() => goTo(index - 1)}>
              <Icon name="chevronLeft" size={22} />
            </button>
            <span className="rl-count">
              <b>{index + 1}</b> / {RULES.length}
            </span>
            <button className="rl-nav" aria-label="다음 룰" disabled={index === RULES.length - 1} onClick={() => goTo(index + 1)}>
              <Icon name="chevronRight" size={22} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
