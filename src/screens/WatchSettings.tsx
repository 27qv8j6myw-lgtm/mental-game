import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { watchStatus, type WatchStatusResult } from "../native";
import { setWatchSetting, useWatchSetting } from "../watch";

/*
 * 내 정보 → 애플워치: '기록 모드에서 워치 사용' 켜기와 워치 상태 (워치 연결이 들어간 iOS 앱에서만 보인다).
 * 켜 두면 폰에서 기록 모드 라운드를 열 때 워치에 라운드가 나온다 (src/watch.ts)
 */

export default function WatchSettings() {
  const on = useWatchSetting();
  const [status, setStatus] = useState<WatchStatusResult | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void watchStatus().then((s) => alive && setStatus(s));
    load();
    // 워치 앱을 깔고 돌아오면 다시 본다
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const state = !status
    ? null
    : status.unsupported
      ? { tone: "off", text: "이 기기는 애플워치를 쓸 수 없어요." }
      : !status.paired
        ? { tone: "off", text: "이 아이폰에 짝지은 애플워치가 없어요." }
        : !status.installed
          ? { tone: "warn", text: "워치에 멘탈게임 앱이 없어요. 아이폰 Watch 앱 → 사용 가능한 앱에서 설치해 주세요." }
          : { tone: "ok", text: status.reachable ? "워치와 연결돼 있어요." : "워치에 앱이 있어요. 워치에서 앱을 열면 연결돼요." };

  return (
    <>
      <p className="pf-desc">기록 모드 라운드에서 타수·퍼트·티샷·OB·해저드·샌드샷을 애플워치로 바로 넣어요.</p>
      <div className="card pf-group">
        <button className="pf-row" role="switch" aria-checked={on} onClick={() => setWatchSetting(!on)}>
          <span className="pf-ic">
            <Icon name="watch" size={20} />
          </span>
          <span className="pf-label">기록 모드에서 워치 사용</span>
          <span className={`switch ${on ? "on" : ""}`} />
        </button>
        {state && (
          <div className={`wt-status ${state.tone}`} role="status">
            {state.text}
          </div>
        )}
      </div>
      <div className="section-title">이렇게 써요</div>
      <div className="card wt-howto">
        <ol>
          <li>폰에서 기록 모드 라운드를 한 번 열면 워치에 그 라운드가 나와요.</li>
          <li>워치에서 홀마다 타수·퍼트·티샷(방향과 벙커·OB·해저드)·OB·해저드·샌드샷을 넣고 맨 아래 저장을 눌러요. 폰을 주머니에 넣어 둬도 바로 저장돼요. 마지막 홀에서는 총 타수를 확인하고 라운드를 끝낼 수 있어요 (방장).</li>
          <li>저장한 기록은 폰 화면에도 바로 보여요. 파3 티샷·클럽·거리 같은 디테일 기록은 폰에서 넣어요.</li>
          <li>라운드 동안 워치에서 골프 운동이 저절로 켜져 화면이 계속 떠 있어요. 모든 홀을 넣거나 라운드를 끝내면 꺼지고 건강 앱에 골프 운동으로 저장돼요 (처음 한 번 건강 권한 허용).</li>
          <li>워치 연결은 라운드마다 하루 동안 쓸 수 있고, 라운드를 끝내면 워치에서 사라져요.</li>
        </ol>
      </div>
    </>
  );
}
