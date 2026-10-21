/**
 * 라운드 목록의 날짜 (2026-10-20 → 10/20). 월은 오른쪽, 일은 왼쪽으로 붙여
 * 10/18 · 9/27 · 10/9 처럼 자릿수가 달라도 '/' 가 한 줄에 서게 한다
 */
export default function RecDate({ date }: { date: string }) {
  const [, m, d] = date.split("-");
  if (!m || !d) return <span className="st-rec-date">{date}</span>;
  return (
    <span className="st-rec-date">
      <span className="m">{Number(m)}</span>/<span className="d">{Number(d)}</span>
    </span>
  );
}
