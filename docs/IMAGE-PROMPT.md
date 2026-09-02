# 카드뉴스 이미지 생성 프롬프트

`템플릿 + 사진 + 주제` → gpt-image-2로 넘어가는 프롬프트가 실제로 어떻게 만들어지는지.
이 문서의 예시는 **코드를 그대로 따라 조립한 것**이다 — 문구를 고치려면
`src/lib/ai/sheet-copy.ts`(문구 짓기)와 `src/lib/imagegen/index.ts`(그림 지시문)를 본다.

---

## 전체 흐름

```
① 기획 대화        주제 · 읽는 사람 · 기획의도가 정해진다
② 분위기 선택      6종 중 하나 → styleId (예: photo-frame)
③ 사진 올리기      Storage에 저장, 내려받을 수 있는 URL이 생긴다
        │
        ▼
④ 클로드 ─ planSheetCopy()
        「이 템플릿에 몇 번째 장을 쓸지, 각 장 글자 자리에 뭘 넣을지」
        → { sheets: [{ index, lines[] }], photoDirection }
        │
        ▼
⑤ 지시문 조립 ─ buildPrompt()
        장마다 한 개. lines를 영어 편집 지시문에 끼워 넣는다
        │
        ▼
⑥ gpt-image-2 ─ editImage()
        images[0] = 템플릿 PNG 주소
        images[1…] = 사용자 사진 주소
        prompt = ⑤
        │
        ▼
⑦ 클로드 검사 ─ verifyCard()   글자 들어갔나 / 자리표시자 남았나 / 한글 깨졌나 / 사진 그대로인가
```

**중요한 갈림길**: 프롬프트는 두 번 만들어진다. ④는 **한국어로 내용을 짓고**,
⑤는 **영어로 그림을 지시한다.** 섞지 않는다 — 이미지 모델에 기획 맥락을 주면
디자인을 새로 그리려 든다.

---

## ④ 클로드에게 가는 프롬프트 (문구 짓기)

`planSheetCopy()` — `effort: "medium"`, 구조화 JSON 출력.

### system

```
(BASE_SYSTEM — 서비스 공통 지시)

(말투 지시 — 사용자 tone 설정)
다음 표현은 절대 쓰지 마라: 대박, 핵꿀팁.
이 카드뉴스는 「실사진」 분위기다. 문구를 그 분위기에 맞춰 써라:
- 사진이 주인공이다. 글자는 사진을 설명하지 말고 거들어라
- 제목은 12자 안쪽
- 항목은 낱말 위주로 짧게
```

### user

```
주제: 등산 초보가 첫 산행에서 흔히 하는 실수
읽는 사람: 등산에 관심은 있는데 아직 안 해본 사람
대상별 지시: (audiencePrompt로 붙는 대상별 화법)
기획의도: 겁먹지 않게, 준비만 하면 된다는 쪽으로
**이번에 꼭 넣어야 하는 것: 무릎 보호대**

이 카드뉴스는 **정해진 디자인 템플릿**으로 만들어진다. 쓸 수 있는 장은 이렇다:
0. [표지] 글자 자리 4개 — 왼쪽 위 브랜드명 / 라벨 박스 한 줄 / 오른쪽 라벨 박스 한 줄 / 아래 큰 제목 두 줄
1. [메뉴·항목 소개 ①] 글자 자리 5개 — 왼쪽 위 라벨 한 줄 / 오른쪽 라벨 한 줄 / 카드 제목 한 줄 / 카드 항목 3줄 / 하단 브랜드명
2. [메뉴·항목 소개 ②] 글자 자리 4개 — 오른쪽 라벨 한 줄 / 카드 제목 한 줄 / 카드 항목 3줄 / 하단 브랜드명
3. [메뉴·항목 소개 ③] 글자 자리 4개 — 왼쪽 위 라벨 한 줄 / 카드 제목 한 줄 / 카드 항목 3줄 / 하단 브랜드명
4. [메뉴·항목 소개 ④] 글자 자리 5개 — 왼쪽 위 라벨 한 줄 / 두 번째 라벨 한 줄 / 카드 제목 한 줄 / 카드 항목 3줄 / 하단 브랜드명
5. [마무리 (팔로우 유도)] 글자 자리 2개 — 가운데 안내 두 줄 / 하단 브랜드명

할 일: 이 중에서 **4~7장**을 골라 순서를 정하고, 각 장의 글자 자리를 채워라.

규칙:
- **0번(표지)은 반드시 첫 장으로 넣는다.**
- 고른 장들이 하나의 흐름이어야 한다: 붙잡기 → 왜 → 무엇을 → 어떻게 → 마무리.
- **주제에 맞지 않는 장은 빼라.** 할인 정보가 없는데 숫자 강조 장을 넣지 마라.
- 같은 구조의 장이 여러 개면 필요한 만큼만 쓴다.
- `lines`는 그 장의 **글자 자리 순서 그대로**, 자리 수만큼 채운다. 빈 줄을 남기지 마라.
- 「~줄」이라고 적힌 자리는 그 줄 수에 맞춰 **줄바꿈(\n)으로** 나눈다.
- 영문 자리(영문 한 줄 · 큰 영문 제목)에는 짧은 영어를 쓴다. 나머지는 한국어.
- 전화번호·이메일·주소·가격·날짜를 **지어내지 마라.** 그런 자리가 있으면
  「프로필 링크에서 확인」처럼 어디서 보면 되는지로 채운다.

`photoDirection`은 빈 문자열로 둬라 — 사용자가 올린 사진을 쓴다.
```

> 사진을 **안 올렸으면** 마지막 줄이 이렇게 바뀐다:
> ```
> `photoDirection` — 사진 자리에 넣을 장면을 **영어**로 한 줄 묘사해라.
>   낱말 몇 개로 장면을 말한다 (예: `people hiking on a mountain trail at sunrise`).
>   주제와 대상에 맞아야 한다. 한국어·고유명사는 쓰지 마라.
> ```

### 돌아오는 값

```json
{
  "sheets": [
    { "index": 0, "lines": ["차곡 아웃도어", "첫 산행", "체크리스트", "등산화만\n있으면 될 줄 알았다"] },
    { "index": 1, "lines": ["준비물", "01", "가방에 꼭 넣을 것",
                            "무릎 보호대\n여벌 양말\n물 1리터", "차곡 아웃도어"] },
    { "index": 2, "lines": ["02", "산에서 자주 하는 실수",
                            "속도를 낸다\n물을 아낀다\n내려올 힘을 안 남긴다", "차곡 아웃도어"] },
    { "index": 5, "lines": ["다음 산행이 궁금하다면\n프로필 링크에서 확인", "차곡 아웃도어"] }
  ],
  "photoDirection": ""
}
```

---

## ⑤ gpt-image-2에게 가는 프롬프트 (그림 지시)

`buildPrompt()` — **장마다 하나씩**, 위 `lines`를 끼워 넣어 만든다.
`parts.join(" ")`이라 실제로는 한 줄로 붙어서 나간다 (아래는 읽기 좋게 줄을 나눴다).

### 예시 — 1번 장 (`index: 1`), 사용자 사진 2장, 브랜드색 네이비

```
The FIRST image is the design template. The next 2 image(s) are the user's own photos.

Keep this exact design: same layout, same photo frames and shapes, same typography style,
same spacing and same background. Do not move, resize or restyle the layout blocks.

Replace the placeholder text with the following lines, in the order they appear in the
design (top to bottom, left to right):
1) "준비물"
2) "01"
3) "가방에 꼭 넣을 것"
4) "무릎 보호대
여벌 양말
물 1리터"
5) "차곡 아웃도어"

If a line is longer than the original, reduce its font size so it fits the same area.
Every placeholder must be replaced — no original sample text may remain.
Render all Korean characters exactly as written: correct, legible Hangul.
Do not invent or distort characters.

Change the brand accent color to #1B2A4A — apply it to badges, thin rules, numbers
and small labels.

Place the user's photo(s) into the photo frame(s) of the design, cropped to fit the
frame shape.
**Do not redraw, restyle or reinterpret the user's photos — they must remain the same
photographs.**
Cropping and resizing to fit the frame is fine; changing what is in the photo is not.
```

### 순서가 왜 이런가

세 덩어리 순서가 결과를 가른다.

1. **지킬 것 먼저** — `Keep this exact design…`
   바꿀 것을 먼저 적으면 모델이 «새로 그리기»로 알아듣고 레이아웃이 무너진다.
2. **바꿀 것** — 글자 → 색 → 사진
3. **못박기** — `Do not redraw… they must remain the same photographs.`
   이 한 줄이 있고 없고가 갈린다. 없으면 «비슷한» 사진을 새로 그려서
   사용자가 찍은 그 물건이 아니게 된다. 넣으니 거품 무늬·나뭇결까지 그대로 왔다.

### 사진을 안 올렸을 때

마지막 덩어리가 `photoDirection`으로 바뀐다.

```
Replace every photo with: people hiking on a mountain trail at sunrise.
Keep the same crop shape, the same number of photos and the same lighting mood.
```

### 다시 만들 때

`regenerate`로 같은 장을 다시 돌리면 앞 판정 결과가 뒤에 붙는다.

```
The previous attempt had these problems. Fix them:
- 3번 문구 「가방에 꼭 넣을 것」이 보이지 않는다
- 시안의 샘플 문구 「LOREM IPSUM」이 남아 있다
```

---

## ⑥ 실제로 나가는 요청

`POST https://api.gptproto.com/…/edits`

```jsonc
{
  "images": [
    "https://firebasestorage.../templates/photo-frame/2.png?alt=media&token=…",  // 템플릿
    "https://firebasestorage.../photos/abc.jpg?alt=media&token=…",              // 사용자 사진
    "https://firebasestorage.../photos/def.jpg?alt=media&token=…"
  ],
  "prompt": "(⑤ 전문)",
  "n": 1,
  "quality": "low",        // IMAGE_QUALITY 환경변수. low 23s / medium 49s / high 143s
  "size": "1024x1024",
  "response_format": "url"
}
```

**주의할 점**

- `images[0]`이 템플릿이어야 한다. 순서가 곧 «FIRST image is the design template».
- 최대 16장. 넘으면 잘라서 보낸다.
- **`data:` URI는 거부된다** (`wrong image url`). 반드시 내려받을 수 있는 주소여야 해서
  템플릿도 Storage에 올려두고 쓴다 (`lib/imagegen/host.ts`).
- `background: "transparent"` 같은 파라미터는 없다.
- 비동기다 — 제출 후 `data.urls.get`을 폴링해서 받는다.

---

## ⑦ 검사

받은 PNG를 클로드에게 다시 보내 네 가지를 본다 (`lib/imagegen/verify.ts`).

| 검사 | 떨어지는 예 |
|---|---|
| ① 넘긴 문구가 그림에 있나 | 3번 줄이 통째로 빠짐 |
| ② 시안의 샘플 문구가 남았나 | `LOREM IPSUM`이 그대로 |
| ③ 한글이 깨졌나 | 「무릅 보호대」처럼 글자가 뭉개짐 |
| ④ 사용자 사진이 그대로인가 | 잘린 건 통과, **내용이 바뀌면 탈락** |

떨어진 장은 **다시 만들지 않고** 우리 렌더러가 그린 것으로 채워 내보낸다.
다시 만들지는 결과를 본 사용자가 정한다 — 자동 재시도는 실측에서 한 장이
세 번 다 같은 이유로 실패하며 7분과 세 장 값을 썼다.
