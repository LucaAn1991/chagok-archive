import Link from "next/link";
import { LogoFull } from "@/components/Logo";
import { AI_DISCLOSURE } from "@/lib/ai-disclosure";

/**
 * 랜딩 (비로그인 «/») — PRD §5-1 · 09-01 공개 런칭 기준 재기획.
 *
 * 목적: ① 3초 안에 «뭐 하는 서비스인지» ② 가입 전환 ③ 발표 자산.
 * 카피는 08-27 확정분을 그대로 쓴다 — 실측 전 숫자 금지, 카드 개수 고정 금지
 * («여러 장», 예시 캡션에만 장수), CTA는 «시작하기» (무료 강조 금지).
 * 결과물 이미지는 실제 렌더러 산출물(public/landing/sample-*.webp) — 목업이 아니다.
 */

const SAMPLES = [
  { src: "/landing/sample-1.webp", alt: "카드뉴스 표지 — 첫 등산 사진, 사진 두 장을 얹은 무드 스타일" },
  { src: "/landing/sample-2.webp", alt: "감성 스타일 카드 — 일월오봉도 텀블러 소개" },
  { src: "/landing/sample-3.webp", alt: "사진이 들어간 본문 슬라이드 — 텀블러" },
  { src: "/landing/sample-4.webp", alt: "도트 스타일 카드 — 오늘의 질문" },
];

const STEPS = [
  {
    step: "1",
    title: "생각나는 대로 말하면",
    body: "막연한 생각도 괜찮아요. «요즘 퇴근하고 운동 시작했는데…» 정도면 충분해요.",
  },
  {
    step: "2",
    title: "차곡이 기획하고 날짜까지",
    body: "누구에게 어떤 이야기를 할지 정리해서, 캘린더에 올릴 날짜까지 잡아둬요.",
  },
  {
    step: "3",
    title: "캡션과 카드뉴스까지 완성",
    body: "당일엔 만들어진 걸 확인하고 올리기만 하면 돼요.",
  },
];

const FAQS = [
  {
    q: "무료인가요?",
    a: "네, 지금은 모든 기능이 무료예요.",
  },
  {
    q: "인스타그램 계정을 연동해야 하나요?",
    a: "아니요. 계정 연동 없이 쓰는 도구라, 비밀번호를 맡기실 일이 없어요.",
  },
  {
    q: "제 계정에 자동으로 올라가나요?",
    a: "아니요. 올리는 건 항상 직접 하세요 — 차곡은 올릴 것을 준비해두는 곳이에요.",
  },
];

export default function Landing() {
  return (
    <main className="flex flex-1 flex-col">
      {/* 상단 바 — 로고 + 로그인 */}
      <header className="mx-auto flex w-full max-w-[960px] items-center justify-between px-4 py-4">
        <LogoFull width={88} />
        <Link
          href="/login"
          className="flex h-10 items-center rounded-md px-4 text-body font-semibold text-ink hover:bg-surface-muted"
        >
          로그인
        </Link>
      </header>

      {/* 1. 히어로 — 3초 메시지 (08-27 확정 카피) */}
      <section className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-10 text-center md:pt-16">
        {/* DESIGN.md §3 — Display는 800 (09-04 개정) */}
        <h1 className="break-keep text-h1 font-bold leading-snug text-ink md:text-display md:font-extrabold">
          생각을 정리하면,
          <br />
          콘텐츠가 차곡차곡
        </h1>
        <p className="mt-4 text-body-l text-sub">인스타그램 전용 콘텐츠 기획 어시스턴트</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="flex h-12 w-full max-w-[320px] items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
          >
            시작하기
          </Link>
          <p className="text-caption text-sub">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-berry-dark underline underline-offset-2">
              로그인
            </Link>
          </p>

          {/*
            **사전 고지** — 「생성형 AI로 운용된다」는 사실은 쓰기 전에 알려야 한다
            (AI 기본법 제31조 ①, `lib/ai-disclosure.ts`). 가입 뒤가 아니라
            비로그인 첫 화면에 둔다.

            09-02 병합 때 한 번 사라졌다 — 팀이 랜딩을 새로 쓰면서 옛 랜딩에 얹어둔
            이 줄이 함께 없어졌다. 법정 의무라 랜딩을 고칠 때 같이 옮겨야 한다.
          */}
          <p className="max-w-[420px] text-center text-caption text-sub">
            {AI_DISCLOSURE.service}
          </p>
        </div>

        {/* 실제 산출물 — 렌더러가 만든 카드뉴스를 비스듬히 겹쳐서 (09-03 실제 4장으로) */}
        <div className="mt-12 flex items-center justify-center">
          {SAMPLES.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={s.src}
              src={s.src}
              alt={s.alt}
              width={224}
              height={224}
              /* 겹쳐서 부채꼴로 — 4장이라 서로 밀어 넣어 폭을 잡는다(모바일 가로 넘침 금지) */
              className={[
                "w-[104px] rounded-lg border border-line bg-surface shadow-sm md:w-[204px]",
                i === 0 ? "z-0 -rotate-6" : "-ml-6 md:-ml-10",
                i === 1 ? "z-10 -rotate-2 md:-my-2" : "",
                i === 2 ? "z-20 rotate-2" : "",
                i === 3 ? "z-10 rotate-6" : "",
              ].join(" ")}
            />
          ))}
        </div>
      </section>

      {/* 2. 범주 대비 (08-27 확정 카피) */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-[960px] px-4 py-16 text-center">
          <p className="break-keep text-h3 font-bold leading-relaxed text-ink">
            예약 발행 도구는 많습니다.
            <br />
            <span className="text-berry-dark">&lsquo;무엇을 올릴지&rsquo;</span> 정해주는 도구는
            없었습니다.
          </p>
        </div>
      </section>

      {/* 3. 발화 대비 (08-27 확정 카피) — 숫자가 아니라 말 */}
      <section className="mx-auto w-full max-w-[960px] px-4 py-16">
        <div className="mx-auto flex max-w-[480px] flex-col items-center gap-3 text-center">
          <p className="w-full rounded-xl bg-surface-muted px-6 py-4 text-body-l text-sub">
            &ldquo;그래서... 뭐라고 쓰지&rdquo;
          </p>
          <span aria-hidden className="text-h3 text-sub">
            ↓
          </span>
          <p className="w-full rounded-xl bg-berry-light px-6 py-4 text-body-l font-semibold text-berry-dark">
            &ldquo;오늘은 이거 올리면 되네&rdquo;
          </p>
        </div>
      </section>

      {/* 4. 작동 3스텝 — 공개 방문자는 사전 설명이 없다 (09-01 신규) */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-[960px] px-4 py-16">
          <h2 className="text-center text-h3 font-bold text-ink">차곡은 이렇게 일해요</h2>
          {/* DESIGN.md §4 — 단독으로 서는 카드는 테두리를 빼고 깊이로 세운다 (09-04) */}
          <div className="stagger mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step} className="card-raise rounded-xl bg-surface p-6">
                <span className="flex size-8 items-center justify-center rounded-pill bg-berry-light text-body font-bold text-berry-dark">
                  {s.step}
                </span>
                <h3 className="mt-4 break-keep text-body-l font-bold text-ink">{s.title}</h3>
                <p className="mt-2 break-keep text-body leading-relaxed text-sub">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. 결과물 노출 (08-27 확정 카피 — 개수 고정 금지) */}
      <section className="mx-auto w-full max-w-[960px] px-4 py-16 text-center">
        <p className="break-keep text-h3 font-bold leading-relaxed text-ink">
          말 한마디 → 대상이 다른 카드 여러 장, <span className="text-berry-dark">날짜까지</span>
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {SAMPLES.map((s) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={s.src}
              src={s.src}
              alt={s.alt}
              width={200}
              height={200}
              className="w-[160px] rounded-lg border border-line md:w-[200px]"
            />
          ))}
        </div>
        <p className="mt-4 text-caption text-sub">
          실제로 차곡이 만든 카드뉴스예요 — 스타일이 다른 네 장.
        </p>
      </section>

      {/* 6. FAQ — 가입 직전의 불안 3개만 (09-01 신규) */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-[640px] px-4 py-16">
          <h2 className="text-center text-h3 font-bold text-ink">자주 묻는 질문</h2>
          <dl className="mt-8 flex flex-col gap-6">
            {FAQS.map((f) => (
              <div key={f.q}>
                <dt className="break-keep text-body-l font-bold text-ink">{f.q}</dt>
                <dd className="mt-1.5 break-keep text-body leading-relaxed text-sub">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 7. 마지막 CTA + 푸터 */}
      <section className="mx-auto w-full max-w-[960px] px-4 py-16 text-center">
        <p className="break-keep text-h3 font-bold text-ink">
          오늘 올릴 게 정해져 있는 기분, 궁금하지 않으세요?
        </p>
        <Link
          href="/signup"
          className="mx-auto mt-6 flex h-12 w-full max-w-[320px] items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
        >
          시작하기
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center justify-between gap-2 px-4 py-6">
          <span className="text-caption text-sub">© 차곡</span>
          <div className="flex gap-4">
            <Link href="/terms" className="text-caption text-sub hover:text-ink">
              이용약관
            </Link>
            <Link href="/privacy" className="text-caption text-sub hover:text-ink">
              개인정보처리방침
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
