/*
 * 골프 룰 그림: 설명 글씨까지 그려 넣은 그림 한 장 (1280×800). 파일 이름이 룰 id 다 (img/tee.webp …)
 */

const SRC = import.meta.glob<string>("./img/*.webp", { eager: true, import: "default" });

/** 룰 그림 (없으면 그리지 않는다). eager 면 지금 보는 쪽 근처라 바로 받는다 */
export function RuleFigure({ id, alt, eager }: { id: string; alt: string; eager: boolean }) {
  const src = SRC[`./img/${id}.webp`];
  if (!src) return null;
  return (
    <figure className="rl-fig">
      <img className="rl-photo" src={src} alt={alt} width={1280} height={800} loading={eager ? "eager" : "lazy"} decoding="async" />
    </figure>
  );
}
