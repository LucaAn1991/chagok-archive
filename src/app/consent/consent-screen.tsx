"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { renderLegalMarkdown } from "@/lib/legal/markdown";
import {
  fetchLatestConsent,
  isConsentCurrent,
  saveInitialConsent,
} from "@/lib/legal/consent-client";
import { LEGAL_PAGE_PATHS } from "@/lib/legal/versions";
import {
  PRIVACY_CONSENT_SUMMARY_MD,
  USAGE_CONSENT_SUMMARY_MD,
} from "@/lib/legal/consent-summaries";

/**
 * 약관 동의 화면 (09-01 지시 §3).
 *
 * - 필수·선택을 한 덩어리로 묶지 않는다 · 선택은 기본 해제 · 다크패턴 금지
 * - 체크박스와 아코디언 토글은 서로 다른 조작 — 라벨을 눌러도 체크되지 않는다
 * - 아코디언은 한 번에 하나, 본문은 영역 안에서만 세로 스크롤(화면 높이 40%)
 * - [다음] 비활성 상태에서 누르면 미체크 필수 항목으로 스크롤 + 잠깐 강조
 *   (경고 문구·빨간 테두리 없음)
 * - 만 14세는 생년월일 없이 체크 하나 — «만 14세 미만이신가요?» 분기에서는
 *   가입을 진행시키지 않는다
 * - 뒤로가기 없음 — 동의 없이 온보딩으로 가는 경로는 가드가 막는다
 * - 재동의(§5): 저장된 버전이 현행과 다르면 개정 안내 줄을 얹는다
 */

type ItemKey = "over14" | "terms" | "privacy" | "usage";
type Mode = "checking" | "first" | "revision" | "under14";

const REQUIRED: ItemKey[] = ["over14", "terms", "privacy"];

export default function ConsentScreen({ termsMd }: { termsMd: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [checked, setChecked] = useState<Record<ItemKey, boolean>>({
    over14: false,
    terms: false,
    privacy: false,
    usage: false, // 🔴 선택 — 기본 해제. 미리 체크하지 않는다
  });
  const [openItem, setOpenItem] = useState<ItemKey | null>(null);
  const [highlight, setHighlight] = useState<ItemKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const rowRefs = useRef<Partial<Record<ItemKey, HTMLDivElement | null>>>({});

  // 진입 — 비로그인이면 로그인으로. 이미 현행 동의가 있으면 온보딩으로 지나간다
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      void (async () => {
        try {
          const latest = await fetchLatestConsent();
          if (cancelled) return;
          if (isConsentCurrent(latest)) {
            router.replace("/onboarding");
            return;
          }
          setMode(latest ? "revision" : "first");
        } catch {
          if (!cancelled) setMode("first"); // 조회 실패 — 동의는 받을 수 있어야 한다
        }
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  const allChecked = checked.over14 && checked.terms && checked.privacy && checked.usage;
  const requiredOk = REQUIRED.every((k) => checked[k]);

  function toggle(key: ItemKey) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /** 전체 동의 — 4개 전부 켜거나 전부 끈다. 개별 하나 해제 시 파생값이라 자동 해제된다 */
  function toggleAll() {
    const next = !allChecked;
    setChecked({ over14: next, terms: next, privacy: next, usage: next });
  }

  /** 비활성 [다음] — 미체크 필수 항목으로 스크롤 + 잠깐 강조 (경고 표현 없음) */
  function nudgeFirstMissing() {
    const missing = REQUIRED.find((k) => !checked[k]);
    if (!missing) return;
    rowRefs.current[missing]?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(missing);
    setTimeout(() => setHighlight(null), 1200);
  }

  async function submit() {
    if (!requiredOk || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const saved = await saveInitialConsent({
        isOver14: checked.over14,
        agreeTerms: checked.terms,
        agreePrivacy: checked.privacy,
        usageDataConsent: checked.usage,
      });
      if (!saved) throw new Error();
      router.replace("/onboarding"); // 저장이 확인된 뒤에만 넘어간다
    } catch {
      setSaveFailed(true); // 🔴 저장 실패 시 온보딩으로 넘어가지 않는다
      setSaving(false);
    }
  }

  if (mode === "checking") {
    return (
      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center p-4">
        <p className="text-body text-sub">불러오는 중...</p>
      </main>
    );
  }

  // 만 14세 미만 분기 — 가입을 진행시키지 않는다
  if (mode === "under14") {
    return (
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-h3 font-bold text-ink">차곡은 만 14세 이상부터 이용할 수 있어요</h1>
        <p className="text-body text-sub">조금 더 자란 뒤에 다시 만나요.</p>
        <button
          type="button"
          onClick={() => setMode("first")}
          className="mt-4 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
        >
          돌아가기
        </button>
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[480px] flex-1 px-4 pb-16 pt-10 md:pt-16">
      {/* 뒤로가기 없음 — 이 화면은 건너뛸 수 없다 */}
      <h1 className="text-h3 font-bold leading-snug text-ink">
        차곡을 시작하기 전에
        <br />
        동의가 필요해요
      </h1>

      {mode === "revision" && (
        /* 재동의 (§5) — 개정 요약. 경고 표현 없이 조용한 안내로 */
        <div className="mt-4 rounded-md bg-surface-muted px-4 py-3">
          <p className="text-body text-ink">약관이 바뀌어서 다시 동의가 필요해요.</p>
          {/* @TODO: 개정 요약 문구 — 별도 전달 예정 (지시 §5) */}
          <p className="mt-1 text-caption text-sub">[TODO: 무엇이 바뀌었는지 요약]</p>
          {/* 재동의 거부 → 탈퇴 안내로 연결 (§5). 설정-계정은 창현 님 화면 */}
          <Link
            href="/settings/account"
            className="mt-2 inline-block text-caption text-sub underline underline-offset-2 transition-colors duration-200 hover:text-ink"
          >
            동의하지 않을래요
          </Link>
        </div>
      )}

      {/* 전체 동의 */}
      <button
        type="button"
        role="checkbox"
        aria-checked={allChecked}
        onClick={toggleAll}
        className="mt-6 flex w-full items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-muted"
      >
        <CheckMark on={allChecked} />
        <span className="min-w-0">
          <span className="block text-body font-semibold text-ink">전체 동의</span>
          {/* 이 문구가 없으면 다크패턴이 된다 (지시 §3-4) */}
          <span className="mt-0.5 block text-caption text-sub">선택 항목 동의를 포함합니다</span>
        </span>
      </button>

      <div className="mt-4 flex flex-col gap-1">
        {/* 1 — 만 14세 (아코디언 없음, 아래 작은 링크) */}
        <div
          ref={(el) => {
            rowRefs.current.over14 = el;
          }}
          className={`rounded-md px-1 py-1 transition-colors duration-300 ${
            highlight === "over14" ? "bg-berry-light" : ""
          }`}
        >
          <ItemRow
            label="만 14세 이상입니다"
            required
            checked={checked.over14}
            onToggle={() => toggle("over14")}
          />
          <button
            type="button"
            onClick={() => setMode("under14")}
            className="ml-10 text-caption text-sub underline underline-offset-2 transition-colors duration-200 hover:text-ink"
          >
            만 14세 미만이신가요?
          </button>
        </div>

        {/* 2 — 이용약관 */}
        <AccordionItem
          rowRef={(el) => {
            rowRefs.current.terms = el;
          }}
          highlighted={highlight === "terms"}
          label="이용약관"
          required
          checked={checked.terms}
          onToggle={() => toggle("terms")}
          open={openItem === "terms"}
          onOpenToggle={() => setOpenItem((o) => (o === "terms" ? null : "terms"))}
          body={renderLegalMarkdown(termsMd)}
          fullPageHref={LEGAL_PAGE_PATHS.terms}
        />

        {/* 3 — 개인정보 수집·이용 */}
        <AccordionItem
          rowRef={(el) => {
            rowRefs.current.privacy = el;
          }}
          highlighted={highlight === "privacy"}
          label="개인정보 수집·이용"
          required
          checked={checked.privacy}
          onToggle={() => toggle("privacy")}
          open={openItem === "privacy"}
          onOpenToggle={() => setOpenItem((o) => (o === "privacy" ? null : "privacy"))}
          /* 전문이 아니라 요약 표 (09-02 지시 §3) — 법 제15조의 네 가지가 묻히지 않게.
             전문은 아래 링크로 */
          body={renderLegalMarkdown(PRIVACY_CONSENT_SUMMARY_MD)}
          fullPageHref={LEGAL_PAGE_PATHS.privacy}
        />

        {/* 4 — 이용 데이터 활용 (선택) */}
        <AccordionItem
          rowRef={(el) => {
            rowRefs.current.usage = el;
          }}
          highlighted={false}
          label="이용 데이터 활용"
          required={false}
          checked={checked.usage}
          onToggle={() => toggle("usage")}
          open={openItem === "usage"}
          onOpenToggle={() => setOpenItem((o) => (o === "usage" ? null : "usage"))}
          /* 요약 표 (09-02 지시 §3) — 확정 카피로 임시 문구 교체 */
          body={renderLegalMarkdown(USAGE_CONSENT_SUMMARY_MD)}
        />
      </div>

      {/* 저장 실패 — 조용한 인라인 안내 (빨간색·느낌표 금지) */}
      {saveFailed && (
        <p className="mt-4 text-body text-ink">동의를 저장하지 못했어요 — 한 번 더 눌러주세요.</p>
      )}

      <button
        type="button"
        aria-disabled={!requiredOk || saving}
        onClick={() => (requiredOk ? void submit() : nudgeFirstMissing())}
        className={`mt-6 flex h-12 w-full items-center justify-center rounded-md text-[15px] font-semibold transition-colors duration-200 ${
          requiredOk && !saving
            ? "bg-action inset-ring inset-ring-action-border text-on-action hover:bg-action-hover"
            : "bg-surface-muted text-sub"
        }`}
      >
        {saving ? "저장하고 있어요..." : "다음"}
      </button>
    </main>
  );
}

/** 체크 표시 — 커스텀 체크박스의 시각 부분 */
function CheckMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition-colors duration-200 ${
        on ? "border-berry bg-action inset-ring inset-ring-action-border text-on-action" : "border-line bg-surface text-transparent"
      }`}
    >
      <Check size={15} />
    </span>
  );
}

/** [필수]/[선택] 구분 + 라벨 + 체크 — 체크박스만 체크를 바꾼다 */
function ItemRow({
  label,
  required,
  checked,
  onToggle,
  trailing,
}: {
  label: string;
  required: boolean;
  checked: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${required ? "필수" : "선택"} ${label} 동의`}
        onClick={onToggle}
        className="flex h-11 w-7 items-center justify-center"
      >
        <CheckMark on={checked} />
      </button>
      <span className="min-w-0 flex-1 text-body text-ink">
        <span className="mr-1.5 text-caption font-semibold text-sub">
          [{required ? "필수" : "선택"}]
        </span>
        {label}
      </span>
      {trailing}
    </div>
  );
}

/**
 * 아코디언 항목 — 본문은 그 자리에서 펼쳐지고(모달·이동 없음), 영역 안에서만
 * 세로 스크롤한다. 토글은 <button aria-expanded> — 체크와는 다른 조작이다.
 */
function AccordionItem({
  rowRef,
  highlighted,
  label,
  required,
  checked,
  onToggle,
  open,
  onOpenToggle,
  body,
  fullPageHref,
}: {
  rowRef: (el: HTMLDivElement | null) => void;
  highlighted: boolean;
  label: string;
  required: boolean;
  checked: boolean;
  onToggle: () => void;
  open: boolean;
  onOpenToggle: () => void;
  body: React.ReactNode;
  fullPageHref?: string;
}) {
  return (
    <div
      ref={rowRef}
      className={`rounded-md px-1 py-1 transition-colors duration-300 ${
        highlighted ? "bg-berry-light" : ""
      }`}
    >
      <ItemRow
        label={label}
        required={required}
        checked={checked}
        onToggle={onToggle}
        trailing={
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${label} 내용 ${open ? "접기" : "펼치기"}`}
            onClick={onOpenToggle}
            className="flex h-11 w-11 items-center justify-center text-sub transition-colors duration-200 hover:text-ink"
          >
            {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
          </button>
        }
      />
      {open && (
        <div className="mb-2 ml-10">
          {/* 화면 높이의 40% 안에서만 스크롤 (지시 §3-4) */}
          <div className="max-h-[40dvh] overflow-y-auto rounded-md border border-line bg-surface p-4">
            <div className="flex flex-col gap-4">{body}</div>
          </div>
          {fullPageHref && (
            <Link
              href={fullPageHref}
              target="_blank"
              rel="noopener"
              className="mt-1.5 inline-block text-caption font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
            >
              전문 페이지에서 보기 ↗
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
