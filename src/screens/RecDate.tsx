/** 라운드 목록의 날짜: 2026-10-04 → 10/04 (월·일 모두 두 자리라 줄마다 폭이 같다) */
export default function RecDate({ date }: { date: string }) {
  const [, m, d] = date.split("-");
  return <span className="st-rec-date">{m && d ? `${m.padStart(2, "0")}/${d.padStart(2, "0")}` : date}</span>;
}
