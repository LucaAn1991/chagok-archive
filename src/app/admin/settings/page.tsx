"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useAdmin } from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/PageHeader";
import ConfirmModal from "@/components/admin/ConfirmModal";

/**
 * 설정 (백오피스 기획 §2-⑤ · §6-1) — 긴급 스위치 + 운영 한도.
 * UI는 admin-design.md. 기본 정보(SEO)·정책 문서 탭은 4단계에서 붙는다.
 * 스위치·안내 문구 변경은 위험 행위 — ConfirmModal에서 사유를 받아
 * 감사 로그(flags.toggle)에 남긴다.
 */

type Flags = { planningEnabled: boolean; imageGenEnabled: boolean; disabledMessage: string };
type FlagKey = "planningEnabled" | "imageGenEnabled";
type Config = {
  maxPlansPerDay: number;
  maxTurnsPerSession: number;
  maxRegenPerSlide: number;
  maxCardsPerRun: number;
  scheduleWeeks: number;
  contactEmail: string;
  seoDescription: string;
};

const FLAG_LABELS: Record<FlagKey, string> = {
  planningEnabled: "기획 (AI 대화·카드 생성)",
  imageGenEnabled: "이미지 생성 (카드뉴스 제작)",
};

const LIMIT_LABELS = {
  maxPlansPerDay: "하루 기획 상한 (건)",
  maxTurnsPerSession: "세션당 대화 턴 상한",
  maxRegenPerSlide: "슬라이드당 재생성 상한",
  maxCardsPerRun: "기획당 카드 상한 (장)",
  scheduleWeeks: "무료 배치 범위 (주)",
} as const;

const BASIC_LABELS = {
  seoDescription: "소개 문구 (검색 결과 설명, 160자)",
  contactEmail: "대표 문의 연락처",
} as const;

const CONFIG_LABELS = { ...LIMIT_LABELS, ...BASIC_LABELS };

type Pending = { kind: "flag"; key: FlagKey; next: boolean } | { kind: "message" } | null;

async function api(user: User, method: "GET" | "PATCH", path: string, body?: unknown) {
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error((data?.error as string) ?? `요청 실패 (${res.status})`);
  return data;
}

/** antd 관례의 on/off 스위치 — 파랑=켜짐 */
function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-[22px] w-11 rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-[#1677FF]" : "bg-[#00000040]"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
          on ? "left-[24px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-md border border-[#E5E7EB] bg-white">
      <h2 className="border-b border-[#E5E7EB] px-5 py-3 text-base font-semibold">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function AdminSettingsPage() {
  const { user, refreshFlags } = useAdmin();
  const [flags, setFlags] = useState<Flags | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async (u: User) => {
    try {
      const [f, c] = await Promise.all([
        api(u, "GET", "/api/admin/flags"),
        api(u, "GET", "/api/admin/config"),
      ]);
      setFlags(f?.flags as Flags);
      setConfig(c?.config as Config);
      setDraft(c?.config as Config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) void load(u);
      }),
    [load],
  );

  async function patchFlags(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      const res = await api(user, "PATCH", "/api/admin/flags", body);
      setFlags(res?.flags as Flags);
      setMessage(done);
      setPending(null);
      void refreshFlags(); // 전역 배너 갱신
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    if (!draft || !config) return;
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(CONFIG_LABELS) as (keyof Config)[]) {
      if (draft[key] !== config[key]) patch[key] = draft[key];
    }
    if (Object.keys(patch).length === 0) {
      setMessage("바뀐 값이 없어요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api(user, "PATCH", "/api/admin/config", patch);
      setConfig(res?.config as Config);
      setDraft(res?.config as Config);
      setMessage("설정을 저장했어요. 반영까지 최대 5분 걸려요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (!flags || !config || !draft) {
    return (
      <div>
        <PageHeader
          breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "설정" }]}
          title="설정"
        />
        <p className="text-sm text-[#6B7280]">{error || "불러오는 중…"}</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "설정" }]}
        title="설정"
      />

      {message && <p className="mb-4 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <Section title="기능 제어">
        <div className="flex flex-col gap-4">
          {(Object.keys(FLAG_LABELS) as FlagKey[]).map((key) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm">{FLAG_LABELS[key]}</span>
              <Switch
                on={flags[key]}
                disabled={busy}
                onClick={() => setPending({ kind: "flag", key, next: !flags[key] })}
              />
            </div>
          ))}
          <div className="border-t border-[#E5E7EB] pt-4">
            <label className="flex flex-col gap-1 text-sm">
              점검 안내 문구{" "}
              <span className="text-xs text-[#6B7280]">
                (기능을 끄면 사용자에게 보여요 · 비우면 아래 기본 문구가 그대로 나가요)
              </span>
              <textarea
                value={flags.disabledMessage}
                maxLength={200}
                rows={2}
                onChange={(e) => setFlags({ ...flags, disabledMessage: e.target.value })}
                // 기본 문구 원본: lib/server/ops.ts FALLBACK_DISABLED_MESSAGE — 바꾸면 여기도 맞춘다
                placeholder="지금은 잠시 정비 중이에요. 조금 뒤에 다시 시도해주세요."
                className="mt-1 rounded-md border border-[#E5E7EB] px-3 py-2"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending({ kind: "message" })}
              className="mt-2 rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm hover:bg-[#F5F5F5] disabled:opacity-50"
            >
              문구 저장
            </button>
          </div>
        </div>
      </Section>

      <Section title="기본 정보">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            서비스명 (브라우저 탭·검색 제목){" "}
            <span className="text-xs text-[#6B7280]">브랜드명이라 변경할 수 없어요</span>
            <input
              type="text"
              value="차곡"
              disabled
              className="rounded-md border border-[#E5E7EB] bg-[#F5F5F5] px-3 py-1.5 text-[#6B7280]"
            />
          </label>
          {(Object.keys(BASIC_LABELS) as (keyof typeof BASIC_LABELS)[]).map((key) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              {BASIC_LABELS[key]}
              {key === "seoDescription" ? (
                <textarea
                  value={draft[key]}
                  rows={2}
                  maxLength={160}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="rounded-md border border-[#E5E7EB] px-3 py-1.5"
                />
              ) : (
                <input
                  type={key === "contactEmail" ? "email" : "text"}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="rounded-md border border-[#E5E7EB] px-3 py-1.5"
                />
              )}
            </label>
          ))}
          <p className="text-xs text-[#6B7280]">
            소개 문구는 저장 즉시 사이트에 반영돼요. 구글 검색 결과에는 재수집 후 반영됩니다.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveConfig()}
            className="self-start rounded-md bg-[#1677FF] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4096FF] disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </Section>

      <Section title="운영 한도">
        <div className="flex flex-col gap-3">
          {(Object.keys(LIMIT_LABELS) as (keyof typeof LIMIT_LABELS)[]).map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              {LIMIT_LABELS[key]}
              <input
                type="number"
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                className="w-48 rounded-md border border-[#E5E7EB] px-3 py-1.5"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveConfig()}
            className="self-start rounded-md bg-[#1677FF] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4096FF] disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </Section>

      <ConfirmModal
        key={pending ? `${pending.kind}-${pending.kind === "flag" ? pending.key : ""}` : "closed"}
        open={pending !== null}
        title={
          pending?.kind === "flag"
            ? `${FLAG_LABELS[pending.key]} 기능을 ${pending.next ? "켤까요?" : "끌까요?"}`
            : "안내 문구를 저장할까요?"
        }
        description={
          pending?.kind === "flag" && !pending.next
            ? "끄는 즉시(최대 1분) 사용자가 이 기능을 쓸 수 없게 돼요."
            : undefined
        }
        confirmLabel={pending?.kind === "flag" ? (pending.next ? "켜기" : "끄기") : "저장"}
        danger={pending?.kind === "flag" && !pending.next}
        reasonRequired
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => {
          if (pending?.kind === "flag") {
            void patchFlags(
              { [pending.key]: pending.next, reason },
              "스위치를 바꿨어요. 서비스 전체 반영까지 최대 1분 걸려요.",
            );
          } else if (pending?.kind === "message") {
            void patchFlags(
              { disabledMessage: flags.disabledMessage, reason },
              "안내 문구를 저장했어요.",
            );
          }
        }}
      />
    </div>
  );
}
