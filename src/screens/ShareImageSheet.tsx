import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { useBack } from "../back";
import { detectInApp } from "../inapp";
import { toPng } from "../shareImage";

/**
 * 공유·저장용 이미지 미리보기 (스코어카드·정산 결과).
 * 만든 이미지를 보여 주고 '공유하기'(폰 공유 창: 카카오톡 등) 또는 '이미지 저장'.
 * 웹에서는 사진첩에 바로 쓸 수 없어서
 * - 아이폰: '이미지 저장'도 공유 창을 연다 (공유 창의 '이미지 저장'을 누르면 사진첩에 들어간다)
 * - 안드로이드: 파일로 내려받는다 (갤러리의 '다운로드' 앨범에 보인다)
 * 공유 창을 못 여는 곳(카카오톡 안 브라우저 등)에서는 이미지를 길게 눌러 저장하도록 안내한다
 */
export default function ShareImageSheet({
  make,
  fileName,
  title,
  onClose,
}: {
  /** 이미지를 그리는 함수 (열 때 한 번 부른다) */
  make: () => Promise<HTMLCanvasElement>;
  fileName: string;
  /** 공유 창에 같이 넘길 제목 */
  title: string;
  onClose: () => void;
}) {
  useBack(true, onClose);
  const [img, setImg] = useState<{ url: string; file: File } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inApp = detectInApp();

  useEffect(() => {
    let alive = true;
    let url = "";
    make()
      .then(toPng)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImg({ url, file: new File([blob], fileName, { type: "image/png" }) });
      })
      .catch((e) => {
        console.error(e);
        if (alive) setErr("이미지를 만들지 못했어요. 닫았다가 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // 열 때 한 번만 그린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canShare =
    !!img && typeof navigator.canShare === "function" && navigator.canShare({ files: [img.file] });
  const ua = navigator.userAgent;
  // 아이패드는 데스크톱처럼 'Macintosh' 로 나오지만 터치가 된다
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  /** 아이폰: 사진첩에 저장하려면 공유 창을 거친다 */
  const saveViaShare = isIOS && canShare;

  const share = async () => {
    if (!img) return;
    setMsg(null);
    try {
      await navigator.share({ files: [img.file], title });
    } catch (e) {
      // 공유 창을 그냥 닫은 경우는 조용히
      if ((e as { name?: string })?.name !== "AbortError")
        setMsg(
          saveViaShare
            ? "공유 창을 열지 못했어요.\n이미지를 길게 눌러 '사진 앱에 저장'을 골라 주세요."
            : "공유하지 못했어요.\n이미지 저장을 눌러 주세요."
        );
    }
  };
  const save = () => {
    if (!img) return;
    if (saveViaShare) {
      void share();
      return;
    }
    const a = document.createElement("a");
    a.href = img.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setMsg(
      isAndroid
        ? "다운로드 폴더에 저장했어요.\n갤러리의 '다운로드' 앨범에서 볼 수 있어요."
        : "다운로드 폴더에 저장했어요.\n저장이 안 되면 이미지를 길게 눌러 저장해 주세요."
    );
  };
  // 누르기 전부터 보이는 안내: 앱 안 브라우저는 길게 눌러 저장, 아이폰은 공유 창에서 한 번 더.
  // 문장마다 한 줄 (마침표 뒤에서 줄을 바꾼다)
  const hint =
    msg ??
    (!img
      ? null
      : inApp
        ? `${inApp.name}에서는 바로 저장이 안 돼요.\n이미지를 길게 눌러 저장하거나 공유해 주세요.`
        : saveViaShare
          ? "이미지 저장을 누르면 공유 창이 열려요.\n공유 창에서 '이미지 저장'을 누르면 사진첩에 저장돼요."
          : isAndroid
            ? "이미지 저장을 누르면 바로 저장돼요.\n갤러리의 '다운로드' 앨범에서 볼 수 있어요."
            : null);

  return (
    <div className="share-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="share-top">
        <span>{title}</span>
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="share-body">
        {err ? (
          <div className="share-note">{err}</div>
        ) : img ? (
          <img className="share-img" src={img.url} alt={title} />
        ) : (
          <div className="share-note">
            <span className="sc-spin" aria-hidden="true" />
            이미지를 만드는 중…
          </div>
        )}
      </div>
      <div className="share-actions">
        {hint && <p className="share-hint">{hint}</p>}
        <div className="share-btns">
          {canShare && (
            <button className="btn-primary" onClick={() => void share()}>
              <Icon name="share" size={18} className="inline-ic" /> 공유하기
            </button>
          )}
          <button className={canShare ? "btn-line wide share-save" : "btn-primary"} disabled={!img} onClick={save}>
            이미지 저장
          </button>
        </div>
      </div>
    </div>
  );
}
