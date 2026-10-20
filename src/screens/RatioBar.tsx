/**
 * 비율 막대: 항목별 색 띠 + 범례(개수·퍼센트).
 * 관리자 대시보드와 기록 분석에서 함께 쓴다. color 가 없으면 순서대로 기본 색(c0~c3).
 */
export default function RatioBar({
  title,
  items,
  unit = "",
}: {
  title: string;
  items: { label: string; count: number; color?: string }[];
  /** 개수 뒤에 붙일 단위 (예: "홀") */
  unit?: string;
}) {
  const total = items.reduce((s, it) => s + it.count, 0);
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const paint = (it: { color?: string }, i: number) =>
    it.color ? { className: "", style: { background: it.color } } : { className: `c${i}` };
  return (
    <div className="ad-ratio">
      <div className="ad-ratio-title">{title}</div>
      <div className="ad-ratio-bar">
        {total === 0 ? (
          <span className="empty" />
        ) : (
          items.map((it, i) =>
            it.count > 0 ? (
              <span
                key={it.label}
                className={paint(it, i).className}
                style={{ flexGrow: it.count, ...paint(it, i).style }}
              />
            ) : null
          )
        )}
      </div>
      <div className="ad-legend">
        {items.map((it, i) => (
          <span key={it.label}>
            <i className={paint(it, i).className} style={paint(it, i).style} />
            {it.label}{" "}
            <b>
              {it.count.toLocaleString("ko-KR")}
              {unit}
            </b>
            <small>{pct(it.count)}%</small>
          </span>
        ))}
      </div>
    </div>
  );
}
