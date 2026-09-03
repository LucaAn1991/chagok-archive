import "server-only";

import { AUDIENCES, AUDIENCE_DEFAULT, audiencePrompt, targetingPrompt } from "@/lib/audiences";
import { BASE_SYSTEM, STR, STR_ARRAY, callJson, obj } from "./client";
import type {
  CardDraft,
  PlanningAI,
  PlanProposal,
  PlanTurnResult,
  RefineDraftResult,
  DraftVariant,
} from "./types";

/**
 * Anthropic Claude 실구현 (PLAN.md §9).
 *
 * `mock.ts`와 **같은 인터페이스**를 채운다 — 화면·API는 어느 쪽이 붙었는지 모른다.
 * 어느 것을 쓸지는 `index.ts`가 `ANTHROPIC_API_KEY` 유무로 고른다.
 *
 * 설계에서 지킨 것:
 * - **구조화 출력을 강제한다** (§9) — 자유 텍스트를 파싱하면 형식이 조금만 흔들려도
 *   F3가 통째로 실패한다. `output_config.format`에 JSON 스키마를 넘긴다.
 * - **자동 1회 재시도** (§9 · PRD §5-7) — 그 다음 실패는 사용자가 누른다.
 * - **노력 수준을 작업별로 조절** (§9 위험 3 대응) — 대화 턴은 빨라야 하므로 낮게,
 *   카드 생성은 결과물이 남으므로 한 단계 높게.
 *
 * 키는 서버에서만 읽는다. `NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다 (CLAUDE.md 보안 2).
 */

/** 대화 턴은 화면에서 기다리는 시간이라 낮게. 카드는 결과물로 남으므로 한 단계 위 */
const EFFORT_TURN = "low" as const;
const EFFORT_CARD = "medium" as const;

/** 온보딩에서 받은 맥락을 시스템 프롬프트 꼬리에 붙인다 */
function contextBlock(ctx: { field: string; tone: string }): string {
  const lines = ["", "사용자 정보:"];
  lines.push(`- 만드는 콘텐츠: ${ctx.field || "(아직 안 밝힘)"}`);
  if (ctx.tone) lines.push(`- 선호하는 말투: ${ctx.tone}`);
  return lines.join("\n");
}

/*
  ⚠️ 스트리밍을 쓰는 스키마는 `reply`를 **첫 속성**으로 둔다 —
  부분 JSON에서 가장 먼저 흘러나와야 화면에 글자를 띄울 수 있다 (client.ts).
*/
const GREETING_SCHEMA = obj({ reply: STR, topicSuggestions: STR_ARRAY }, [
  "reply",
  "topicSuggestions",
]);

const IDEA_SCHEMA = obj({ reply: STR, topic: STR }, ["reply", "topic"]);

const SELECTION_SCHEMA = obj(
  { reply: STR, purposes: STR_ARRAY, intent: STR, seriesTitle: STR },
  ["reply", "purposes", "intent", "seriesTitle"],
);

const CARD_SCHEMA = obj({ title: STR, shortTitle: STR, intent: STR }, [
  "title",
  "shortTitle",
  "intent",
]);

/*
  ⑤ 다듬기 — **기획안 전체를 매번 돌려받는다.** 바뀐 것만 받으면 「무엇이 안 왔는지」와
  「빈 값으로 지우라는 것인지」를 구분할 수 없다. 안 바꿀 값은 들어온 값을 그대로 다시
  적어 보내게 한다.

  `slideCount`는 숫자 아니면 0이다 — JSON 스키마에 nullable을 쓰면 모델이 자주
  문자열 "null"을 보낸다. 0을 «정하지 않음»으로 약속하고 아래에서 null로 바꾼다.
*/
const REFINE_SCHEMA = obj(
  {
    reply: STR,
    title: STR,
    shortTitle: STR,
    intent: STR,
    extraNote: STR,
    slideCount: { type: "integer" },
  },
  ["reply", "title", "shortTitle", "intent", "extraNote", "slideCount"],
);

/*
  ⑤ 다듬기 후보 — 같은 기획안을 다른 각도로 다시 잡는다.
  각도 라벨(`angle`)을 따로 받는 이유: 제목만 셋 늘어놓으면 무엇이 다른지 읽어내야 한다.
  «무엇을 바꾼 것인지»를 한마디로 먼저 말해준다.
*/
const VARIANTS_SCHEMA = obj(
  {
    variants: {
      type: "array",
      items: obj({ angle: STR, title: STR, shortTitle: STR, intent: STR }, [
        "angle",
        "title",
        "shortTitle",
        "intent",
      ]),
    },
  },
  ["variants"],
);

/** 후보 개수. 둘은 비교가 안 되고 넷부터는 고르는 일이 커진다 */
const VARIANT_COUNT = 3;

/** 템플릿 한 벌이 6장인데 표지가 고정이라 그 밖은 만들 수 없다 (`lib/ai/sheet-copy.ts`) */
const MIN_SLIDES = 4;
const MAX_SLIDES = 7;

/** ② 단계 대상 후보는 AI가 만들지 않는다 — lib/audiences.ts가 단일 출처 (08-28) */
function candidates(): PlanProposal {
  return { audiences: AUDIENCES.map((a) => a.label), purposes: [] };
}

const DEFAULT_AUDIENCE_LABEL =
  AUDIENCES.find((a) => a.id === AUDIENCE_DEFAULT)?.label ?? AUDIENCES[0].label;

export const claudePlanningAI: PlanningAI = {
  async greeting(ctx, onText): Promise<PlanTurnResult> {
    const result = await callJson<{ reply: string; topicSuggestions: string[] }>({
      system: BASE_SYSTEM + contextBlock(ctx),
      user: [
        "대화를 시작하는 첫 인사를 쓰고, 오늘 올릴 만한 주제 후보 3개를 함께 내라.",
        "",
        "주제 후보 규칙 (어기면 쓸 수 없다):",
        "- **이미 사용자 안에 있는 재료만** 가리킨다 — 겪은 것 / 느낀 것 / 찍어둔 것.",
        "- 없는 걸 새로 만들게 하는 주제 금지 («노하우 공유», «해결법 정리», «비법 공개» 류).",
        "- 외부 트렌드·뉴스·콘텐츠 마케팅 템플릿에서 가져오지 않는다.",
        "- 각 후보는 **띄어쓰기 포함 16자 이내**. 칩 한 줄에 들어가야 한다.",
        "- 사용자가 만드는 콘텐츠 분야를 반영하되, 억지로 끼워 넣지 않는다.",
        /*
          분야를 모를 때 (09-02 — 「다른 이야기」로 들어온 경우).
          분야가 비면 «무엇이든 좋다»가 되어 후보가 뭉뚱그려진다. 그래서 분야 대신
          **형식**으로 좁힌다 — 어떤 일을 하든 쓸 수 있는 소재들이다.
        */
        "- 분야를 «아직 안 밝힘»으로 받았다면 분야를 짐작하지 마라. 대신 누구나 쓸 수 있는",
        "  **일상 소재**로 낸다 (이번 주에 있었던 일 · 자주 받는 질문 · 요즘 쓰는 물건 같은 결).",
        "",
        "reply는 두 문장 이내. 아래에서 골라도 되고 직접 적어도 된다는 점을 알려라.",
      ].join("\n"),
      schema: GREETING_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    /*
      개수·길이를 스키마로 못 박았으므로 여기서 맞춘다.
      16자를 넘는 칩은 두 줄로 접혀 화면이 흔들린다 — 길이로 먼저 거르고,
      3개가 안 되면 걸러낸 것이라도 채워 넣는다(빈 칩 줄이 더 나쁘다).
    */
    const all = result.topicSuggestions.filter((t) => typeof t === "string" && t.trim());
    const fits = all.filter((t) => t.length <= 16);
    const topicSuggestions = [...fits, ...all.filter((t) => !fits.includes(t))].slice(0, 3);

    return { reply: result.reply, topicSuggestions };
  },

  async ideaTurn(idea, ctx, onText): Promise<PlanTurnResult> {
    const result = await callJson<{ reply: string; topic: string }>({
      system: BASE_SYSTEM + contextBlock(ctx),
      user: [
        "사용자가 오늘 올리고 싶은 것을 이렇게 적었다:",
        `"""${idea}"""`,
        "",
        "할 일:",
        "1. 이 말을 **주제 한 줄**로 다듬어라 (topic). 40자 이내. 사용자가 쓴 말을 살리고 새 소재를 지어내지 않는다.",
        "2. 그 주제를 받았다는 것과, 이제 «누구에게 말할지»만 정하면 된다는 것을 알리는 reply를 써라.",
        "",
        "reply 규칙: 세 문장 이내. 안 골라도 AI가 알아서 정한다는 점을 반드시 알린다.",
      ].join("\n"),
      schema: IDEA_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    return {
      reply: result.reply,
      topic: result.topic.slice(0, 40),
      proposal: candidates(),
    };
  },

  async selectionTurn(topic, selected, ctx, onText): Promise<PlanTurnResult> {
    // 안 고르면 AI가 정한다 (IA 2.1-②) — 빈 배열을 그대로 넘기지 않고 여기서 메운다
    const autoPicked = selected.audiences.length === 0;
    const audiences = autoPicked ? [DEFAULT_AUDIENCE_LABEL] : selected.audiences;

    const result = await callJson<{
      reply: string;
      purposes: string[];
      intent: string;
      seriesTitle: string;
    }>({
      system: BASE_SYSTEM + contextBlock(ctx),
      user: [
        `주제: ${topic}`,
        `말할 대상: ${audiences.join(", ")}`,
        autoPicked ? "(사용자가 고르지 않아 기본값으로 정했다. reply에서 그렇게 골랐다고 알려라.)" : "",
        "",
        "대상별 지시:",
        ...audiences.map((a) => `- ${a}: ${audiencePrompt(a)}`),
        "",
        "할 일:",
        "1. purposes — 이 주제를 이 대상에게 말하는 **목적**을 1~3개. 짧은 명사구로 (예: 공감 얻기, 정보 전달, 팔로우 유도). 사용자가 고르는 항목이 아니라 네가 정한다.",
        "2. intent — 이 시리즈의 기획의도를 한 문장으로. 카드 상세에만 보인다.",
        "3. seriesTitle — 나중에 카드들을 묶어 보여줄 제목. 주제를 살려 짧게.",
        "4. reply — 어떻게 정했는지 알리고, **대상마다 기획안을 하나씩 준비해 보여준다**고 안내. 세 문장 이내.",
        "   ⚠️ 「이대로 카드 만들기」를 누르라고 하지 마라 — 다음 화면은 카드가 아니라 기획안이다 (09-02).",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: SELECTION_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    // 목적은 1~3개. 스키마로 못 정해서 여기서 자른다 — 비면 화면에 빈 자리가 남는다
    const purposes = result.purposes.filter((p) => typeof p === "string" && p.trim()).slice(0, 3);

    return {
      reply: result.reply,
      topic,
      audiences,
      purposes: purposes.length > 0 ? purposes : ["공감 얻기"],
      intent: result.intent,
      seriesTitle: result.seriesTitle,
      readyToConfirm: true,
    };
  },

  async generateCard({ topic, audience, purposes, intent, targeting }): Promise<CardDraft> {
    const result = await callJson<{ title: string; shortTitle: string; intent: string }>({
      system: BASE_SYSTEM,
      user: [
        `주제: ${topic}`,
        `이 카드의 대상: ${audience}`,
        `대상별 지시: ${audiencePrompt(audience)}`,
        // 세부 대상(연령·성별·말투·시간대) — 있으면 문구 말투·단어를 그 사람에 맞춘다 (09-03)
        targetingPrompt(targeting),
        purposes.length ? `목적: ${purposes.join(", ")}` : "",
        intent ? `시리즈 기획의도(참고): ${intent}` : "",
        "",
        "이 대상 한 명을 위한 게시물 카드 하나를 만들어라.",
        "",
        "- title — 게시물 제목. 대상별 지시를 반영해 이 사람에게 말 거는 제목으로.",
        "- shortTitle — **12자 이내.** 캘린더 칸이 좁아 길면 잘린다.",
        "  ⚠️ **같은 주제로 만든 다른 카드들이 캘린더에 나란히 놓인다.** 주제만 반복하면",
        "  전부 같은 글자가 되어 구분할 수 없다. **이 카드만의 각도**가 드러나게 지어라.",
        "- intent — 이 카드 하나의 기획의도 한 문장. 시리즈 기획의도를 그대로 베끼지 않는다.",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: CARD_SCHEMA,
      effort: EFFORT_CARD,
    });

    return {
      title: result.title,
      // 12자 규칙은 화면이 깨지는 문제라 여기서 한 번 더 자른다 (DESIGN §8)
      shortTitle: result.shortTitle.length > 12 ? `${result.shortTitle.slice(0, 11)}…` : result.shortTitle,
      audience,
      intent: result.intent,
    };
  },

  async draftVariants({ topic, audience, title, intent }): Promise<DraftVariant[]> {
    const result = await callJson<{ variants: DraftVariant[] }>({
      system: BASE_SYSTEM,
      user: [
        `주제: ${topic}`,
        `대상: ${audience}`,
        `대상별 지시: ${audiencePrompt(audience)}`,
        "",
        "지금 기획안:",
        `- 제목: ${title}`,
        `- 기획의도: ${intent}`,
        "",
        `할 일: **같은 주제를 같은 대상에게** 말하는 다른 방법 ${VARIANT_COUNT}개를 내라.`,
        "",
        "규칙:",
        "- **지금 기획안과 겹치지 않게.** 제목만 바꿔 쓴 것은 후보가 아니다.",
        "  들어가는 방식이 달라야 한다 — 겁을 주는 대신 준비물로, 목록 대신 한 사람의 이야기로,",
        "  결론을 먼저 말하는 대신 질문으로 여는 식.",
        "- `angle` — **무엇이 다른지 한마디로.** 8자 안팎. 제목을 줄여 쓰지 마라.",
        "  (좋은 예: 「겁주기보다 준비물로」 · 「한 사람의 실패담으로」)",
        "- `title` — 그 각도로 다시 지은 게시물 제목.",
        "- `shortTitle` — **12자 이내.** 캘린더 칸이 좁아 길면 잘린다.",
        "- `intent` — 그 각도의 기획의도 한 문장.",
        "- 대상은 바뀌지 않는다. 다른 사람에게 말하는 안을 내지 마라.",
      ].join("\n"),
      schema: VARIANTS_SCHEMA,
      effort: EFFORT_TURN,
    });

    return (result.variants ?? [])
      .filter((v) => v && v.title && v.angle)
      .slice(0, VARIANT_COUNT)
      .map((v) => ({
        ...v,
        // 12자 규칙은 화면이 깨지는 문제라 여기서 한 번 더 자른다 (DESIGN §8)
        shortTitle:
          v.shortTitle && v.shortTitle.length > 12
            ? `${v.shortTitle.slice(0, 11)}\u2026`
            : v.shortTitle || v.title.slice(0, 12),
      }));
  },

  async refineDraft({ topic, draft, history, message }, onText): Promise<RefineDraftResult> {
    const result = await callJson<{
      reply: string;
      title: string;
      shortTitle: string;
      intent: string;
      extraNote: string;
      slideCount: number;
    }>({
      system: BASE_SYSTEM,
      user: [
        `주제: ${topic}`,
        `이 기획안의 대상: ${draft.audience}`,
        `대상별 지시: ${audiencePrompt(draft.audience)}`,
        targetingPrompt(draft.targeting),
        "",
        "지금 기획안:",
        `- 제목: ${draft.title}`,
        `- 짧은 제목: ${draft.shortTitle}`,
        `- 기획의도: ${draft.intent}`,
        `- 꼭 넣을 것: ${draft.extraNote || "(아직 없음)"}`,
        `- 카드 장수: ${draft.slideCount ?? "(정하지 않음 — 템플릿이 정한다)"}`,
        ...(history.length > 0
          ? ["", "지금까지 주고받은 말:", ...history.map((h) => `${h.role === "user" ? "사용자" : "차곡"}: ${h.text}`)]
          : []),
        "",
        `사용자가 방금 한 말: ${message}`,
        "",
        "할 일: 이 말을 반영해 기획안을 고치고, 무엇을 어떻게 고쳤는지 한두 문장으로 답해라.",
        "",
        "규칙:",
        "- **바꾸지 않은 값도 그대로 다시 적어라.** 빈 문자열은 «지웠다»는 뜻이 된다.",
        "- `extraNote` — 사용자가 «꼭 넣어달라»고 한 내용을 누적한다. 앞에 있던 것을 지우지 마라.",
        `- \`slideCount\` — 사용자가 장수를 말했으면 그 숫자. 말하지 않았으면 들어온 값 그대로.`,
        `  **${MIN_SLIDES}~${MAX_SLIDES}장 밖은 만들 수 없다.** 사용자가 그 밖의 수를 말하면`,
        `  값은 바꾸지 말고(들어온 값 유지), \`reply\`에서 «${MIN_SLIDES}~${MAX_SLIDES}장까지만 돼요»라고`,
        "  이유와 함께 말해라. 조용히 깎지 마라.",
        "  정하지 않은 상태는 0으로 적는다.",
        "- `shortTitle` — 12자 이내. 제목이 바뀌면 이것도 함께 다시 지어라.",
        "- 사용자가 말투나 피할 표현을 바꿔달라고 하면, 그건 이 기획 하나가 아니라",
        "  계정 전체 성격이라 **설정에서 바꾸는 것**이라고 알려줘라. 기획안은 건드리지 않는다.",
      ].join("\n"),
      schema: REFINE_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    /*
      범위 밖 값은 **버린다** — 프롬프트로 막아뒀지만 모델이 어길 수 있다.
      조용히 깎으면 사용자는 10장을 요청하고 7장을 받고도 이유를 모른다.
      들어온 값을 유지하면 화면에는 «아직 그대로»로 보이고, reply가 이유를 말한다.
    */
    const n = Number(result.slideCount);
    const slideCount =
      Number.isInteger(n) && n >= MIN_SLIDES && n <= MAX_SLIDES ? n : draft.slideCount;

    return {
      reply: result.reply,
      draft: {
        title: result.title || draft.title,
        shortTitle:
          result.shortTitle.length > 12
            ? `${result.shortTitle.slice(0, 11)}\u2026`
            : result.shortTitle || draft.shortTitle,
        intent: result.intent || draft.intent,
        extraNote: result.extraNote,
        slideCount,
      },
    };
  },
};
