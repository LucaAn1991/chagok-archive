/**
 * AI 생성물 표시 — 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 제31조
 * (2026-01-22 시행 · 위반 시 과태료 3천만원 이하).
 *
 * **의무 주체가 우리다.** 생성형 AI로 만든 결과물을 제공하는 사업자가 표시한다.
 * 지켜야 하는 건 셋이다.
 *
 * ① **사전 고지** — 이 서비스가 생성형 AI로 운용된다는 사실을 미리 알린다.
 *    → 랜딩(`app/page.tsx`) · 이용약관(`app/terms/page.tsx`)
 *
 * ② **결과물 표시** — 가시적(문구·워터마크) **또는** 비가시적(메타데이터) 중 택일.
 *    이미지는 **비가시(XMP)** 로 간다 — 사용자가 올릴 결과물 안에 우리 문구를
 *    박아 넣지 않기 위해서다(스톡 표기를 이미지 밖에 두는 것과 같은 이유).
 *    → `lib/render/render-slide.ts`
 *
 * ③ **다운로드 단계 1회 안내** — 시행령은 ②를 비가시 방식으로만 할 경우
 *    다운로드 단계에서 「생성형 AI로 생성되었다」는 사실을 **최소 1회 안내**하도록
 *    한다. 우리는 비가시만 쓰므로 **이 안내가 빠지면 ②가 통째로 무효다.**
 *    → 제작 결과 화면의 저장 버튼 옆 상시 문구 + 저장 완료 토스트
 *
 * **캡션은 텍스트라 메타데이터를 실을 수 없다.** 그래서 텍스트 결과물만
 * 가시 표시로 처리한다(③과 같은 화면).
 *
 * @TODO: 약관 본문 작성 시 §1의 조항 본문을 법무 검토받는다 (지금은 화면 고지가 실질)
 */

/**
 * 화면에 그대로 쓰는 고지 문구. **네 화면이 한 벌을 나눠 쓴다** —
 * 문구가 갈라지면 어디는 고지가 있고 어디는 없는 상태가 되고, 그건 곧 위반이다.
 */
export const AI_DISCLOSURE = {
  /** ① 사전 고지 — 랜딩·약관에서 쓴다 */
  service: "차곡은 생성형 AI로 콘텐츠 문구와 카드뉴스 이미지를 만듭니다.",

  /** ③ 다운로드 단계 상시 문구 — 저장 버튼 옆에서 늘 보인다 */
  download: "이 이미지는 생성형 AI로 만들어졌어요.",

  /** ③ 저장 완료 토스트에 붙는 꼬리 */
  downloadToast: "(AI로 만든 이미지예요)",

  /** ② 텍스트 결과물 — 메타데이터를 실을 수 없어 화면에 표시한다 */
  caption: "AI가 쓴 문구예요. 그대로 쓰거나 고쳐서 쓰세요.",

  /** 캡션 복사 토스트에 붙는 꼬리 */
  captionToast: "(AI로 만든 문구예요)",
} as const;

/** 약관 조항 — 제목과 본문을 함께 둔다 (다른 조항은 아직 본문이 없다) */
export const AI_DISCLOSURE_TERMS = {
  heading: "제5조 (생성형 인공지능의 이용 및 결과물 표시)",
  body:
    `① ${AI_DISCLOSURE.service}\n` +
    "② 회사는 생성형 인공지능으로 생성한 이미지에 기계가 판독할 수 있는 방식(메타데이터)으로 " +
    "생성 사실을 표시하며, 회원이 이미지를 내려받는 단계에서 그 사실을 안내합니다.\n" +
    "③ 생성형 인공지능이 작성한 문구에는 화면에 생성 사실을 표시합니다.\n" +
    "④ 본 조는 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 제31조에 따릅니다.",
} as const;

/**
 * 이미지에 심는 비가시 표시(XMP).
 *
 * **`Iptc4xmpExt:DigitalSourceType`이 핵심이다.** IPTC가 정한 국제 표준 값이라
 * 사람이 아니라 기계가 읽는다 — 시행령이 말하는 「기계가 판독할 수 있는 방법」이 이것이다.
 * 여러 플랫폼이 이 값을 읽어 게시물에 «AI 정보» 라벨을 자동으로 붙이므로,
 * 사용자가 인스타그램에 올린 뒤에도 표시가 살아남는다.
 *
 * 값을 `trainedAlgorithmicMedia`(전부 AI가 그린 것)가 아니라
 * **`compositeWithTrainedAlgorithmicMedia`** 로 둔 이유 — 우리 카드는 한 장 안에
 * ①AI가 쓴 문구 ②사람이 찍은 사진(사용자 업로드·스톡) ③사람이 짠 템플릿이
 * 섞인 **합성물**이다. 전부 AI가 그렸다고 표시하면 그건 그것대로 사실이 아니다.
 *
 * @TODO: 플랫폼별 라벨 표시 동작은 각 사 정책에 달려 있어 실제 업로드로 확인이 필요하다
 */
const IPTC_DIGITAL_SOURCE_TYPE =
  "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia";

/** 사람이 파일 정보 창에서 읽게 되는 설명 — 기계 표시만으로 끝내지 않는다 */
const XMP_DESCRIPTION =
  "이 이미지는 생성형 인공지능으로 만들어졌습니다. " +
  "(인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 제31조)";

/**
 * PNG에 실을 XMP 패킷.
 *
 * `<?xpacket ...?>`으로 감싸는 건 XMP 규격이 요구하는 형식이다 —
 * 이 껍데기가 없으면 읽는 쪽이 패킷의 시작·끝을 못 찾는다.
 */
export const AI_DISCLOSURE_XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
      <Iptc4xmpExt:DigitalSourceType>${IPTC_DIGITAL_SOURCE_TYPE}</Iptc4xmpExt:DigitalSourceType>
      <xmp:CreatorTool>차곡 (Chagok) · 생성형 AI</xmp:CreatorTool>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${XMP_DESCRIPTION}</rdf:li>
        </rdf:Alt>
      </dc:description>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
