/**
 * PNG에 XMP 패킷을 **규격대로** 심는다.
 *
 * **왜 sharp의 `withXmp`를 쓰지 않는가** — 넣어보면 libvips가 `zTXt`(zlib으로
 * 압축한 청크)로 쓴다. 키워드는 맞지만 XMP 규격(Part 3)은 PNG에서
 * **비압축 `iTXt`**를 요구한다. sharp 자신은 되읽지만, 남의 도구가 못 읽으면
 * 「기계가 판독할 수 있는 표시」라는 법적 요건이 무너진다 —
 * 우리가 확인할 수 없는 쪽에서 조용히 실패하는 종류의 문제라 규격을 따른다.
 *
 * 하는 일은 청크 하나를 IHDR 바로 뒤에 끼워 넣는 것뿐이다. PNG는
 * `[길이 4B][타입 4B][데이터][CRC 4B]`가 줄지어 있는 단순한 형식이라,
 * 이미지 데이터(IDAT)는 건드리지 않는다.
 */

/** XMP 규격이 지정한 PNG 키워드 — 이 이름이어야 읽는 쪽이 찾는다 */
const XMP_KEYWORD = "XML:com.adobe.xmp";

/** CRC-32 표 — PNG 청크마다 붙는 검사값용. 한 번만 만든다 */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(buf: Buffer): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (const byte of buf) {
    c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** `[길이][타입][데이터][CRC]` 한 덩어리를 만든다. CRC는 타입 + 데이터로 계산한다 */
function buildChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * iTXt 청크의 데이터부.
 *
 * 순서가 규격으로 정해져 있다 —
 * `키워드\0` `압축여부(0=안 함)` `압축방식(0)` `언어\0` `번역된 키워드\0` `본문(UTF-8)`.
 * 언어·번역 키워드는 XMP에서 비워 둔다.
 */
function buildItxtData(keyword: string, text: string): Buffer {
  return Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from(text, "utf8"),
  ]);
}

/**
 * PNG 버퍼에 XMP를 심어 새 버퍼를 돌려준다.
 *
 * 넣는 자리는 **IHDR 바로 뒤**다 — 규격상 IHDR과 IEND 사이 아무 데나 둘 수 있지만,
 * 읽는 쪽이 이미지 전체를 받기 전에 표시를 발견할 수 있도록 앞에 둔다.
 *
 * PNG가 아니거나 형태가 이상하면 **원본을 그대로 돌려준다.** 표시를 못 붙이는 것보다
 * 이미지를 깨뜨리는 쪽이 사용자에게 더 나쁘다 (부르는 쪽이 실패를 로그로 남긴다).
 */
export function embedXmpInPng(png: Buffer, xmp: string): Buffer {
  // PNG 시그니처 8바이트 — 아니면 손대지 않는다
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 8 + 12 || !png.subarray(0, 8).equals(SIGNATURE)) return png;

  // 첫 청크는 항상 IHDR이고 길이는 13이다 (규격 고정)
  const firstType = png.toString("ascii", 12, 16);
  if (firstType !== "IHDR") return png;
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8);

  const chunk = buildChunk("iTXt", buildItxtData(XMP_KEYWORD, xmp));
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}
