import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import { useAuth } from "../auth";
import { Avatar, Icon } from "../icons";
import { NOTICE_STALE_MS, refreshMyRounds, useMyRounds } from "../notices";
import { loadRecordRounds, type RecordRound } from "../recordStats";
import { loadStats, type StatsResult } from "../stats";
import { BADGES, loadBadges, type Earned } from "../badges";
import { computeYearReview, reviewYears, type YearReview as Review } from "../yearReview";
import { renderYearReview } from "../shareImage";
import { wonSigned } from "../util";
import { seoulYear } from "../goals";
import type { RoundListItem } from "../types";
import ShareImageSheet from "./ShareImageSheet";
import TopBar, { BackButton } from "./TopBar";
import { CollectCard } from "./CollectCard";
import { badgeIcon } from "./Badges";

/*
 * 올해의 골프 결산: 기록 탭 '라운드별 기록' 위의 '2026 골프 결산'을 누르면 새 화면으로 열리고 아래로 쭉 이어진다.
 * 라운드·홀 → 스코어 → 골프장 → 함께한 사람 → 버디·이글 → 내기 정산 → 올해 얻은 배지 → 요약 이미지 공유
 */

const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

interface Loaded {
  list: RoundListItem[];
  records: RecordRound[];
  stats: StatsResult | null;
  earned: Map<string, Earned>;
}

/** 기록 탭 '라운드별 기록' 위 (파란 상자). 누르면 결산 화면으로 */
export function YearReviewEntry({ year = seoulYear() }: { year?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="card yr-entry" onClick={() => setOpen(true)}>
        <span className="yr-entry-ic">
          <Icon name="spark" size={22} />
        </span>
        <span className="yr-entry-tx">
          <b>{year} 골프 결산</b>
          <span>올 한 해를 돌아봐요</span>
        </span>
        <Icon name="chevronRight" size={20} />
      </button>
      {open && createPortal(<YearReview initialYear={year} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** 결산 화면 (사용 방법·골프 룰과 같은 화면 전체 층, 아래로 스크롤) */
function YearReview({ initialYear, onClose }: { initialYear: number; onClose: () => void }) {
  useBack(true, onClose);
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const name = user?.displayName?.trim() || "나";
  const cached = useMyRounds(uid);
  const [year, setYear] = useState(initialYear);
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const list = await refreshMyRounds(uid, NOTICE_STALE_MS).catch(() => cached);
      const [records, stats, earned] = await Promise.all([
        loadRecordRounds(uid, list, { all: true }),
        loadStats(uid, list).catch(() => null),
        loadBadges(uid, list, user?.goal).catch(() => new Map<string, Earned>()),
      ]);
      if (alive) setData({ list, records, stats, earned });
    })().catch((e) => {
      console.error(e);
      if (alive) setErr("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  const review = useMemo(
    () => (data ? computeYearReview(year, uid, data.list, data.records, data.stats, data.earned) : null),
    [data, year, uid]
  );
  const years = useMemo(() => {
    const ys = data ? reviewYears(data.list) : [];
    return ys.includes(year) ? ys : [year, ...ys];
  }, [data, year]);

  return (
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label={`${year} 골프 결산`}>
      <div className="guide-inner">
        <TopBar left={<BackButton onClick={onClose} />} />
        <div className="sheet yr-sheet">
          <h2 className="page-title">{year} 골프 결산</h2>
          {err || !review ? (
            <div className="card">
              <div className="empty-note">{err ?? "한 해를 모으는 중…"}</div>
            </div>
          ) : (
            <YearBody review={review} name={name} years={years} setYear={setYear} earned={data!.earned} />
          )}
        </div>
      </div>
    </div>
  );
}

function YearBody({
  review,
  name,
  years,
  setYear,
  earned,
}: {
  review: Review;
  name: string;
  years: number[];
  setYear: (y: number) => void;
  earned: Map<string, Earned>;
}) {
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <YearChips years={years} year={review.year} setYear={setYear} />
      {review.rounds === 0 ? (
        <div className="card">
          <div className="empty-note">{review.year}년 라운드가 아직 없어요.</div>
        </div>
      ) : (
        <>
          <Cover review={review} name={name} />
          <ScoreSection review={review} />
          <CourseSection review={review} />
          <PeopleSection review={review} />
          <BirdieSection review={review} />
          <MoneySection review={review} />
          <BadgeSection review={review} earned={earned} />
          <button className="btn-primary yr-share" onClick={() => setSharing(true)}>
            <Icon name="share" size={18} />
            {review.year} 결산 이미지로 공유·저장
          </button>
        </>
      )}
      {sharing && (
        <ShareImageSheet
          make={() => renderYearReview({ ...review, name })}
          fileName={`멘탈게임-${review.year}-결산.png`}
          title={`${name}님의 ${review.year} 골프 결산`}
          onClose={() => setSharing(false)}
        />
      )}
    </>
  );
}

function Head({ title }: { title: ReactNode }) {
  return <div className="section-title yr-sec">{title}</div>;
}

function YearChips({ years, year, setYear }: { years: number[]; year: number; setYear: (y: number) => void }) {
  if (years.length < 2) return null;
  return (
    <div className="yr-years">
      {years.map((y) => (
        <button key={y} className={y === year ? "on" : ""} onClick={() => setYear(y)}>
          {y}
        </button>
      ))}
    </div>
  );
}

function Cover({ review, name }: { review: Review; name: string }) {
  return (
    <>
      <div className="card yr-hero">
        <div className="yr-hero-title">{name}님의 {review.year}년</div>
        <div className="yr-hero-col">
          <span>끝낸 라운드</span>
          <b>
            {review.rounds}
            <small>라운드</small>
          </b>
        </div>
        <div className="yr-hero-col">
          <span>걸어온 홀</span>
          <b>
            {review.holes}
            <small>홀</small>
          </b>
        </div>
      </div>
      {review.first && review.last && (
        <p className="yr-lead">
          {md(review.first.date)} {review.first.course || "첫 라운드"}에서 시작해 {md(review.last.date)}{" "}
          {review.last.course || "마지막 라운드"}까지 쳤어요.
        </p>
      )}
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="card yr-stat">
      <span className="yr-stat-label">{label}</span>
      <b className={`yr-stat-value ${tone ?? ""}`}>{value}</b>
      {sub && <span className="yr-stat-sub">{sub}</span>}
    </div>
  );
}

function ScoreSection({ review }: { review: Review }) {
  return (
    <>
      <Head title="스코어" />
      <div className="yr-pair">
        <Stat
          label="평균 타수"
          value={review.avg18 != null ? `${review.avg18}타` : "–"}
          sub={review.rounds18 ? `18홀 ${review.rounds18}라운드` : "18홀을 끝까지 치면"}
        />
        <Stat
          label="베스트 스코어"
          value={review.best18 ? `${review.best18.gross}타` : "–"}
          tone="loss"
          sub={review.best18 ? `${md(review.best18.date)} · ${review.best18.course}` : undefined}
        />
      </div>
    </>
  );
}

function CourseSection({ review }: { review: Review }) {
  return (
    <>
      <Head title="가장 많이 간 골프장" />
      <div className="card yr-feature">
        <span className="yr-feature-ic">
          <Icon name="flag" size={26} />
        </span>
        <b>{review.topCourse?.name ?? "–"}</b>
        {review.topCourse && <span>{review.topCourse.count}번 다녀왔어요</span>}
      </div>
      <div className="yr-pair">
        <Stat label="다녀간 골프장" value={`${review.courses}곳`} />
        <Stat
          label="가장 바빴던 달"
          value={review.busiestMonth ? `${review.busiestMonth.month}월` : "–"}
          sub={review.busiestMonth ? `${review.busiestMonth.count}라운드` : undefined}
        />
      </div>
    </>
  );
}

function PeopleSection({ review }: { review: Review }) {
  return (
    <>
      <Head title="가장 많이 함께 친 사람" />
      {review.companions.length === 0 ? (
        <div className="card">
          <div className="empty-note">올해는 혼자 기록했어요.</div>
        </div>
      ) : (
        <div className="card yr-people">
          {review.companions.map((p, i) => (
            <div key={p.uid} className="yr-person">
              <span className={`yr-rank r${i + 1}`}>{i + 1}</span>
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={40} />
              <b>{p.name}</b>
              <span>{p.count}번</span>
            </div>
          ))}
        </div>
      )}
      {review.companionCount > 0 && <p className="yr-lead">모두 {review.companionCount}명과 함께 쳤어요.</p>}
    </>
  );
}

function BirdieSection({ review }: { review: Review }) {
  return (
    <>
      <Head title="버디 · 이글" />
      <div className="yr-trio">
        <Stat label="버디" value={review.birdies} tone="terra" />
        <Stat label="이글" value={review.eagles} tone="olive" />
        <Stat label="파" value={review.pars} />
      </div>
      {review.mostBirdies && (
        <Stat
          label="버디가 가장 많았던 라운드"
          value={`버디 ${review.mostBirdies.count}개`}
          tone="terra"
          sub={`${md(review.mostBirdies.date)} · ${review.mostBirdies.course}`}
        />
      )}
    </>
  );
}

function MoneySection({ review }: { review: Review }) {
  const m = review.money;
  if (!m)
    return (
      <>
        <Head title="내기 정산" />
        <div className="card">
          <div className="empty-note">올해는 내기 없이 즐겼어요.</div>
        </div>
      </>
    );
  return (
    <>
      <Head title="내기 정산" />
      <Stat
        label={`${m.rounds}라운드 합계`}
        value={m.total === 0 ? "±0원" : wonSigned(m.total)}
        tone={m.total > 0 ? "pos" : m.total < 0 ? "neg" : ""}
        sub={`딴 라운드 ${m.wins} · 잃은 라운드 ${m.losses}`}
      />
      {m.best && (
        <Stat
          label="가장 많이 받은 라운드"
          value={wonSigned(m.best.net)}
          tone="pos"
          sub={`${md(m.best.date)} · ${m.best.course}`}
        />
      )}
    </>
  );
}

function BadgeSection({ review, earned }: { review: Review; earned: Map<string, Earned> }) {
  return (
    <>
      <Head title={`올해 얻은 배지 ${review.badges.length}개`} />
      {review.badges.length === 0 ? (
        <div className="card">
          <div className="empty-note">올해 얻은 배지가 아직 없어요.</div>
        </div>
      ) : (
        <div className="cc-grid">
          {review.badges.map((b) => {
            const def = BADGES.find((x) => x.id === b.id)!;
            const e = earned.get(b.id)!;
            return (
              <CollectCard
                key={b.id}
                color={def.color}
                icon={badgeIcon(def.icon, def.n)}
                title={def.title}
                value={e.value}
                meta={md(e.date)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
