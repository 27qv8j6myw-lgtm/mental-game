import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { useBack } from "../back";
import { Icon } from "../icons";
import { CHAPTERS, TOPICS, type TopicId } from "../guide/content";
import { GuideNav, RoleTag, type Role } from "../guide/blocks";

/** 빠른 시작: 방장·참여자가 하는 일 순서 (누르면 그 항목으로) */
const QUICK: Record<Role, { title: string; steps: [string, TopicId][] }> = {
  host: {
    title: "라운드를 만들 때",
    steps: [
      ["새 라운드 만들기", "create"],
      ["초대 코드 공유", "lobby"],
      ["대기실에서 게임 시작", "lobby"],
      ["홀마다 스코어 저장", "score"],
      ["최종 확정", "finish"],
    ],
  },
  guest: {
    title: "초대받았을 때",
    steps: [
      ["코드로 참여하기", "join"],
      ["대기실에서 내 정보 확인", "lobby"],
      ["스코어 입력", "score"],
      ["정산 확인 · 송금", "results"],
    ],
  },
};

/** 설명서 안에서 쌓인 화면 하나 = 기기 뒤로가기 기록 하나 (뒤로가기가 오면 그 전 화면으로) */
function BackEntry({ onBack }: { onBack: () => void }) {
  useBack(true, onBack);
  return null;
}

/**
 * 사용 방법: 화면 위에 덮어 연다 (닫으면 보던 화면·입력이 그대로).
 * 본 화면을 쌓아 두어 링크로 다른 항목에 갔다가 뒤로가기를 누르면 보던 항목(스크롤 위치까지)으로 돌아온다.
 * 이전·다음 버튼은 쌓지 않고 바꾼다. topic 을 주면 그 항목부터 열고, 그 항목에서 뒤로가기는 바로 닫는다.
 */
export default function GuideScreen({ onClose, topic: start }: { onClose: () => void; topic?: TopicId }) {
  /** 본 항목들 (마지막이 지금 화면, 비어 있으면 목차) */
  const [trail, setTrail] = useState<TopicId[]>(start ? [start] : []);
  // 항목으로 바로 열었다: 첫 항목은 뒤로가기 기록 없이 (뒤로가기 = 닫기)
  const [direct, setDirect] = useState(!!start);
  const layer = useRef<HTMLDivElement>(null);
  /** 깊이별 스크롤 위치 (0 = 목차) · 돌아갈 때 맞출 위치 */
  const scrolls = useRef<number[]>([]);
  const restore = useRef<number | null>(null);
  useBack(true, onClose);
  useLayoutEffect(() => {
    layer.current?.scrollTo(0, restore.current ?? 0);
    restore.current = null;
  }, [trail]);

  const saveScroll = () => {
    scrolls.current[trail.length] = layer.current?.scrollTop ?? 0;
  };
  /** 링크·목차에서 항목 열기: 쌓는다 */
  const go = (id: TopicId) => {
    if (id === trail[trail.length - 1]) return;
    saveScroll();
    setTrail((t) => [...t, id]);
  };
  /** 이전·다음: 지금 항목을 바꾼다 */
  const swap = (id: TopicId) => setTrail((t) => [...t.slice(0, -1), id]);
  /** 한 화면 뒤로 (보던 스크롤 위치로) */
  const back = () => {
    if (trail.length === 1 && direct) {
      // 바로 연 항목에서 목차로: 이제부터는 목차를 바닥으로 쌓는다
      setDirect(false);
      setTrail([]);
      return;
    }
    restore.current = scrolls.current[trail.length - 1] ?? 0;
    setTrail((t) => t.slice(0, -1));
  };
  const toList = () => {
    restore.current = direct ? 0 : scrolls.current[0] ?? 0;
    setDirect(false);
    setTrail([]);
  };

  const topic = trail[trail.length - 1] ?? null;
  const from = trail.length >= 2 ? TOPICS.find((t) => t.id === trail[trail.length - 2]) : null;
  const i = topic ? TOPICS.findIndex((t) => t.id === topic) : -1;
  const cur = i >= 0 ? TOPICS[i] : null;
  const prev = i > 0 ? TOPICS[i - 1] : null;
  const next = i >= 0 && i < TOPICS.length - 1 ? TOPICS[i + 1] : null;

  return (
    <div className="guide-layer" ref={layer} role="dialog" aria-modal="true" aria-label="사용 방법">
      <div className="guide-inner">
        <div className="topbar">
          <div className="brand">
            <span className="dot">
              <Icon name="book" size={18} />
            </span>
            사용 방법
          </div>
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {trail.map((_, k) => (direct && k === 0 ? null : <BackEntry key={k} onBack={back} />))}
        <div className="sheet gd-sheet">
          <GuideNav.Provider value={go}>
            {cur ? (
              <>
                {/* 링크로 왔으면 보던 항목으로, 아니면 목차로 */}
                <button className="st-back" onClick={from ? back : toList}>
                  <Icon name="chevronLeft" size={16} /> {from ? from.title : "목차"}
                </button>
                <div className="gd-topic-head">
                  <span className="gd-chapter">
                    {cur.no} · {cur.chapter}
                  </span>
                  <h2>
                    {cur.title}
                    {cur.role && <RoleTag role={cur.role} />}
                  </h2>
                </div>
                <div className="gd-body" key={cur.id}>
                  {cur.body()}
                </div>
                <div className="gd-pager">
                  {prev ? (
                    <button className="prev" onClick={() => swap(prev.id)}>
                      <small>이전</small>
                      <b>
                        <Icon name="chevronLeft" size={14} />
                        {prev.title}
                      </b>
                    </button>
                  ) : (
                    <span />
                  )}
                  {next ? (
                    <button className="next" onClick={() => swap(next.id)}>
                      <small>다음</small>
                      <b>
                        {next.title}
                        <Icon name="chevronRight" size={14} />
                      </b>
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
                <button className="btn-line wide gd-totoc" onClick={toList}>
                  목차 보기
                </button>
              </>
            ) : (
              <>
                <div className="gd-hero">
                  <b>멘탈게임 사용 방법</b>
                  <span>
                    라운드 만들기부터 정산·기록까지 차례대로 정리했어요. 궁금한 항목을 누르세요.
                  </span>
                </div>

                <div className="section-title">빠른 시작</div>
                <div className="gd-quick">
                  {(["host", "guest"] as const).map((r) => (
                    <div className="card gd-quick-card" key={r}>
                      <div className="gd-quick-head">
                        <RoleTag role={r} />
                        {QUICK[r].title}
                      </div>
                      <ol>
                        {QUICK[r].steps.map(([label, id], k) => (
                          <li key={k}>
                            <button onClick={() => go(id)}>
                              <span className="gd-num sm">{k + 1}</span>
                              <span className="gd-quick-label">{label}</span>
                              <Icon name="chevronRight" size={14} />
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>

                {CHAPTERS.map((c, ci) => (
                  <Fragment key={c.title}>
                    <div className="section-title">
                      {ci + 1}. {c.title}
                    </div>
                    <div className="card gd-toc">
                      {c.topics.map((t) => (
                        <button className="gd-toc-row" key={t.id} onClick={() => go(t.id)}>
                          <span className="gd-toc-main">
                            <span className="t">
                              {t.title}
                              {t.role && <RoleTag role={t.role} />}
                            </span>
                            <span className="s">{t.desc}</span>
                          </span>
                          <Icon name="chevronRight" size={16} />
                        </button>
                      ))}
                    </div>
                  </Fragment>
                ))}
              </>
            )}
          </GuideNav.Provider>
        </div>
      </div>
    </div>
  );
}
