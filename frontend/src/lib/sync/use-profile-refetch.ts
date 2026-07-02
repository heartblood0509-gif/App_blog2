"use client";

// 실시간 프로필 변경 구독 + "편집 폼이 열려 있는 동안에는 refetch 를 미루는" 가드.
//
// 왜 필요한가 — 배경 refetch(다른 기기의 실시간 변경 반영)는 setState → 재렌더를 유발한다.
// 이 재렌더가 Radix 모달(Dialog)의 open/close 생명주기와 겹치면, 모달이 body 에 걸어둔
// `pointer-events: none` 의 복원이 누락돼 화면이 "보이는데 클릭·입력이 안 되는" 상태로
// 굳을 수 있다(react-remove-scroll / DismissableLayer 경합). 같은 계정으로 두 기기가
// 동시에 동기화하면 배경 refetch 빈도가 크게 올라 이 경합이 실제로 터진다(한 기기만
// 쓰면 거의 안 나고, 재시작하면 body 인라인 스타일이 초기화돼 사라진다).
//
// 해결 — 폼이 열려 있는 동안은 refetch 를 멈추고(밀린 변경 1건만 기억), 폼이 닫히는
// 순간 밀린 변경을 반영한다. 편집 중에는 어차피 목록이 화면에 없으니 지연돼도 무해하다.

import { useEffect, useRef } from "react";
import { subscribeProfilesChanged, type ProfileKind } from "@/lib/sync/profile-sync-engine";

export function useProfileRefetch(
  kind: ProfileKind,
  formOpen: boolean,
  refetch: (opts?: { silent?: boolean }) => void,
): void {
  const pending = useRef(false);
  const formOpenRef = useRef(formOpen);

  // ref 는 렌더 중이 아니라 커밋 후 갱신(react-hooks/refs). 구독 콜백은 이벤트 시점에 최신값을 읽는다.
  useEffect(() => {
    formOpenRef.current = formOpen;
    // 폼이 닫히는 순간 밀린 변경 반영.
    if (!formOpen && pending.current) {
      pending.current = false;
      refetch({ silent: true });
    }
  }, [formOpen, refetch]);

  useEffect(() => {
    return subscribeProfilesChanged((changed) => {
      if (changed !== kind && changed !== "all") return;
      if (formOpenRef.current) {
        pending.current = true; // 폼 열림 중 — 닫힌 뒤 한 번에 반영
        return;
      }
      refetch({ silent: true });
    });
  }, [kind, refetch]);
}
