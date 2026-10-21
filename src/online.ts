import { useSyncExternalStore } from "react";

/** 기기가 인터넷에 연결돼 있는지 (끊기면 바로 알려 준다) */
const subscribe = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);
