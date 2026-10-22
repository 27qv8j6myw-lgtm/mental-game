import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import type { TopicId } from "./content";

/*
 * 사용 방법 본문 조각: 단계 목록·팁·주의·계산 예시·표·화면 예시 틀.
 * 모양은 앱 화면과 같은 디자인(카드·칩)에 .gd-* 스타일을 더한다.
 */

/** 본문에서 다른 항목으로 가기 (GuideScreen 이 채운다) */
export const GuideNav = createContext<(id: TopicId) => void>(() => {});

/** 다른 항목으로 가는 글자 링크 */
export function GoTo({ to, children }: { to: TopicId; children: ReactNode }) {
  const go = useContext(GuideNav);
  return (
    <button className="gd-link" onClick={() => go(to)}>
      {children}
      <Icon name="chevronRight" size={13} />
    </button>
  );
}

export type Role = "host" | "guest";
export const ROLE_LABEL: Record<Role, string> = { host: "방장", guest: "참여자" };

/** 누가 하는 일인지: 방장·참여자 */
export function RoleTag({ role }: { role: Role }) {
  return <span className={`gd-role ${role}`}>{ROLE_LABEL[role]}</span>;
}

/** 본문 소제목 */
export function H({ children }: { children: ReactNode }) {
  return <h3 className="gd-h">{children}</h3>;
}

/** 본문 문단 */
export function P({ children }: { children: ReactNode }) {
  return <p className="gd-p">{children}</p>;
}

/** 점 목록 */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="gd-list">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** 번호 단계 */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="gd-steps">
      {items.map((it, i) => (
        <li key={i}>
          <span className="gd-num">{i + 1}</span>
          <div>{it}</div>
        </li>
      ))}
    </ol>
  );
}

/** 알아 두면 좋은 것 (파란 상자) */
export function Tip({ title = "알아 두세요", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="gd-tip">
      <Icon name="info" size={17} />
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}

/** 주의 (노란 상자) */
export function Warn({ title = "주의", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="gd-warn">
      <span className="gd-warn-ic">!</span>
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}

/** 계산 예시 카드 (label: 위 작은 글자, 입력 예시 등) */
export function Example({ title, label = "계산 예시", children }: { title: string; label?: string; children: ReactNode }) {
  return (
    <div className="gd-ex">
      <div className="gd-ex-label">{label}</div>
      <div className="gd-ex-title">{title}</div>
      {children}
    </div>
  );
}

/**
 * 작은 표. 숫자 칸은 오른쪽 정렬 (num 에 칸 번호).
 * 첫 칸(제목)은 줄을 바꾸지 않는다. 숫자 칸이 없는 표는 설명이 한 줄에 안 들어가거나 표가 넘치면
 * 줄마다 제목 아래 다음 줄들에 설명을 길게 쓴다 (stacked. 세 칸 이상이면 설명 앞에 칸 이름)
 */
export function Table({ head, rows, num = [] }: { head: ReactNode[]; rows: ReactNode[][]; num?: number[] }) {
  const ref = useRef<HTMLTableElement>(null);
  const [stacked, setStacked] = useState(false);
  const canStack = num.length === 0;
  useLayoutEffect(() => {
    const table = ref.current;
    if (!canStack || !table) return;
    const measure = () => {
      // 나란히 놓았을 때 설명 칸이 두 줄 이상이 되는지 본다
      table.classList.remove("stacked");
      const lineCount = (el: HTMLElement) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top / 4))).size;
      };
      const wraps =
        table.scrollWidth > (table.parentElement?.clientWidth ?? table.scrollWidth) + 1 ||
        [...table.querySelectorAll<HTMLTableCellElement>("tbody td:not(:first-child)")].some(
          (td) => lineCount(td) > 1 + (td.textContent?.split("\n").length ?? 1) - 1
        );
      if (wraps) table.classList.add("stacked");
      setStacked(wraps);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table.parentElement ?? table);
    return () => ro.disconnect();
  }, [canStack, rows]);
  return (
    <div className="gd-table-wrap">
      <table ref={ref} className={`gd-table ${stacked ? "stacked" : ""}`}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={num.includes(i) ? "num" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  className={num.includes(j) ? "num" : ""}
                  // 세 칸 이상 표를 쌓아 보일 때 값 앞에 붙는 칸 이름
                  data-label={head.length > 2 && j > 0 && typeof head[j] === "string" ? head[j] : undefined}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 화면 예시 틀: 앱 화면 조각을 그대로 그려 보여 준다 (누를 수 없다) */
export function Shot({ caption, children, flush = false }: { caption?: string; children: ReactNode; flush?: boolean }) {
  return (
    <figure className="gd-shot">
      <div className={`gd-shot-body ${flush ? "flush" : ""}`} aria-hidden="true">
        {children}
      </div>
      <figcaption>
        <span className="gd-shot-tag">화면 예시</span>
        {caption}
      </figcaption>
    </figure>
  );
}

/** 질문·답 (자주 묻는 질문) */
export function QA({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="gd-qa">
      <div className="gd-q">
        <span>Q</span>
        {q}
      </div>
      <div className="gd-a">{children}</div>
    </div>
  );
}
