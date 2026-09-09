"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { csvCell } from "@/lib/admin/api";
import { useAdmin } from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import TrendChart from "@/components/admin/TrendChart";

/**
 * 대시보드 = 백오피스 홈 (백오피스 기획 §2-④) — 3층 구성.
 * ❶ 처리 대기 현황  ❷ 주요 지표(실시간, 7일 평균 대비)  ❸ 추이.
 */

type DailyMetrics = {
  date: string;
  signups: number;
  onboarded: number;
  confirmedPlans: number;
  published: number;
  calendarBalance: number;
  fallbackCards: number;
  backfilled: boolean;
};

const TREND_LABELS = {
  signups: "신규 가입",
  onboarded: "온보딩 완료",
  confirmedPlans: "기획 확정",
  published: "발행 처리",
  calendarBalance: "발행 예정 사용자 (7일)",
  fallbackCards: "이미지 생성 실패 카드",
} as const;
type TrendKey = keyof typeof TREND_LABELS;

type MetricNums = {
  signups: number;
  onboarded: number;
  plansStarted: number;
  confirmedPlans: number;
  cardsCreated: number;
  balance: number;
  published: number;
};
type Metrics = {
  today: MetricNums;
  yesterday: MetricNums;
  weekAvg: MetricNums;
  actions: { fallbackCards: number; deletionIssues: number; openInquiries: number };
};

type HealthRow = {
  key: keyof MetricNums;
  label: string;
  today: number;
  yesterday: number;
  avg: number;
};

/** AARRR 깔때기 순서 — 가입 → 온보딩 → 기획 → 확정 → 제작 → 예정 → 발행 */
const HEALTH_LABELS: Record<keyof Metrics["today"], string> = {
  signups: "새로 가입한 사용자",
  onboarded: "온보딩을 마친 사용자",
  plansStarted: "새로 시작한 기획 대화",
  confirmedPlans: "확정 완료된 기획안",
  cardsCreated: "기획에서 생성된 카드",
  balance: "발행 일정이 잡힌 사용자 (7일 내)",
  published: "게시물 발행 완료 («올렸어요»)",
};

/**
 * 증감 표시 — 절대 증감 + 방향 화살표. %를 안 쓰는 이유: 값이 한 자릿수라
 * 1→2도 +100%로 표시돼 왜곡이 크다. 기준값은 즉시 툴팁으로 —
 * 브라우저 기본 title은 뜨기까지 ~1초 지연이 있어 직접 그린다.
 */
function Delta({ today, base, label }: { today: number; base: number; label: string }) {
  const diff = today - base;
  const rounded = Math.round(diff * 10) / 10;
  const baseText = Number.isInteger(base) ? base : base.toFixed(1);
  const tip = (
    <span
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#1F2937] px-2 py-0.5 text-xs text-white group-hover:block"
    >
      {label} {baseText}
    </span>
  );
  if (base === 0 && today === 0) return <span className="text-[#6B7280]">—</span>;
  if (Math.abs(rounded) < 0.05)
    return (
      <span className="group relative text-[#6B7280]">
        —{tip}
      </span>
    );
  const text = Math.abs(rounded % 1) < 0.05 ? Math.abs(Math.round(rounded)) : Math.abs(rounded).toFixed(1);
  return (
    <span className={`group relative ${rounded > 0 ? "text-green-700" : "text-red-600"}`}>
      {rounded > 0 ? "▲" : "▼"} {text}
      {tip}
    </span>
  );
}

const HEALTH_COLUMNS: Column<HealthRow>[] = [
  { key: "label", title: "지표", width: "40%", render: (r) => r.label },
  {
    key: "today",
    align: "center",
    title: "오늘",
    width: "20%",
    nowrap: true,
    render: (r) => <b>{r.today}</b>,
  },
  {
    key: "yesterday",
    align: "center",
    title: "어제 대비",
    width: "20%",
    nowrap: true,
    render: (r) => <Delta today={r.today} base={r.yesterday} label="어제" />,
  },
  {
    key: "avg",
    align: "center",
    title: "최근 7일 대비",
    width: "20%",
    nowrap: true,
    render: (r) => <Delta today={r.today} base={r.avg} label="7일 평균" />,
  },
];

export default function AdminDashboardPage() {
  const { flags } = useAdmin();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [trend, setTrend] = useState<DailyMetrics[] | null>(null);
  const [trendKey, setTrendKey] = useState<TrendKey>("calendarBalance");
  const [error, setError] = useState("");

  const load = useCallback(async (u: User) => {
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/metrics/today", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setMetrics((await res.json()) as Metrics);
      // 추이는 따로 — 빠진 날짜 채우기(backfill)가 껴서 첫 응답이 느릴 수 있다
      const trendRes = await fetch("/api/admin/metrics/trend", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (trendRes.ok) {
        const data = (await trendRes.json()) as { trend: DailyMetrics[] };
        setTrend(data.trend);
      }
    } catch {
      setError("지표를 불러오지 못했어요. 새로고침 해주세요.");
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) void load(u);
      }),
    [load],
  );

  const healthRows: HealthRow[] = metrics
    ? (Object.keys(HEALTH_LABELS) as (keyof MetricNums)[]).map((key) => ({
        key,
        label: HEALTH_LABELS[key],
        today: metrics.today[key],
        yesterday: metrics.yesterday[key],
        avg: metrics.weekAvg[key],
      }))
    : [];

  const actionItems: { key: string; label: string; count: number | undefined; href: string | null }[] = [
    {
      key: "deletion",
      label: "탈퇴 처리 실패 (개인정보 파기 미완료)",
      count: metrics?.actions.deletionIssues,
      href: "/admin/inbox",
    },
    {
      key: "fallback",
      label: "이미지 생성 실패 카드",
      count: metrics?.actions.fallbackCards,
      href: null, // 건별 처리 큐가 아니라 경보 숫자 — 개별 확인은 회원 상세 (09-09)
    },
    {
      key: "inquiries",
      label: "미처리 문의",
      count: metrics?.actions.openInquiries,
      href: "/admin/inbox",
    },
  ];

  return (
    <div>
      <PageHeader breadcrumb={[{ label: "관리자" }, { label: "대시보드" }]} title="대시보드" />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">서비스 상태</h2>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["기획 (AI 대화·카드 생성)", flags?.planningEnabled],
              ["이미지 생성 (카드뉴스 제작)", flags?.imageGenEnabled],
            ] as const
          ).map(([label, on]) => (
            <Link
              key={label}
              href="/admin/settings"
              className={`flex items-center gap-3 rounded-md border bg-white p-4 ${
                on === false ? "border-red-300" : "border-[#E5E7EB]"
              } hover:bg-[#FAFAFA]`}
            >
              <span
                aria-hidden
                className={`h-3 w-3 rounded-full ${
                  on === undefined ? "bg-[#D9D9D9]" : on ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-sm">{label}</span>
              <span
                className={`ml-auto text-sm font-semibold ${
                  on === undefined ? "text-[#6B7280]" : on ? "text-green-700" : "text-red-600"
                }`}
              >
                {on === undefined ? "확인 중…" : on ? "정상 작동 중" : "꺼짐"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">확인 필요</h2>
        <div className="grid grid-cols-3 gap-3">
          {actionItems.map((item) => {
            const body = (
              <>
                <p className="text-xs text-[#6B7280]">{item.label}</p>
                <p
                  className={`mt-1 text-xl font-semibold ${
                    item.count === undefined
                      ? "text-[#6B7280]"
                      : item.count > 0
                        ? "text-red-600"
                        : "text-[#1F2937]"
                  }`}
                >
                  {item.count === undefined ? "–" : `${item.count}건`}
                </p>
              </>
            );
            const cls = "rounded-md border border-[#E5E7EB] bg-white p-4";
            return item.href ? (
              <Link key={item.key} href={item.href} className={`${cls} hover:bg-[#FAFAFA]`}>
                {body}
              </Link>
            ) : (
              <div key={item.key} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">주요 지표 (오늘 · KST 0시 기준)</h2>
        <DataTable
          columns={HEALTH_COLUMNS}
          rows={healthRows}
          rowKey={(r) => r.key}
          loading={!metrics && !error}
          emptyTitle="지표를 불러오지 못했어요"
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">추이 (최근 30일)</h2>
          <div className="flex items-center gap-2">
          {trend && trend.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const header = "날짜," + (Object.keys(TREND_LABELS) as TrendKey[]).map((k) => TREND_LABELS[k]).join(",");
                const lines = trend.map((d) =>
                  [d.date, ...(Object.keys(TREND_LABELS) as TrendKey[]).map((k) => d[k])].map(csvCell).join(","),
                );
                const blob = new Blob(["\uFEFF" + [header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `차곡-지표-${trend[trend.length - 1].date}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded border border-[#D9D9D9] bg-white px-2 py-0.5 text-[13px] text-[#1F2937] hover:border-[#1677FF] hover:text-[#1677FF]"
            >
              CSV 다운로드
            </button>
          )}
          <select
            value={trendKey}
            onChange={(e) => setTrendKey(e.target.value as TrendKey)}
            className="rounded-md border border-[#E5E7EB] px-2 py-1 text-sm"
          >
            {(Object.keys(TREND_LABELS) as TrendKey[]).map((k) => (
              <option key={k} value={k}>
                {TREND_LABELS[k]}
              </option>
            ))}
          </select>
          </div>
        </div>
        <div className="rounded-md border border-[#E5E7EB] bg-white p-4">
          {trend === null ? (
            <p className="py-8 text-center text-sm text-[#6B7280]">집계 중… (빠진 날짜를 채우고 있어요)</p>
          ) : trend.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#6B7280]">아직 쌓인 스냅샷이 없어요</p>
          ) : (
            <>
              <TrendChart points={trend.map((d) => [d.date, d[trendKey] as number])} />
              <p className="mt-2 text-xs text-[#6B7280]">매일 05:00 스냅샷 기준.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
