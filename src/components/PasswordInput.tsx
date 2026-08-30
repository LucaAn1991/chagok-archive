"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import InlineAlert from "@/components/InlineAlert";

/**
 * 비밀번호 입력칸 — 오른쪽 눈 버튼으로 입력값 보이기/숨기기를 전환한다.
 * 로그인·회원가입·(나중에) 비밀번호 변경까지 비밀번호 칸은 전부 이걸 쓴다.
 *
 * 아이콘 Eye/EyeOff — 사용자 확정(08-28). DESIGN.md §5 표에는 아직 없다.
 * @TODO: DESIGN.md §5 아이콘 표에 «비밀번호 보기 | Eye / EyeOff» 행 추가 필요 (사람이 수정)
 *
 * 눈 버튼 클릭 영역 44×44 (DESIGN.md §5 «아이콘 단독 클릭 영역 최소 44px»).
 * 에러 시 테두리만 진하게 — 빨간색을 쓰지 않는다 (DESIGN.md §2).
 */
type PasswordInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 로그인은 current-password, 가입·변경은 new-password — 브라우저 자동완성 구분용 */
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  hasError?: boolean;
  /** 입력 중 실시간 안내 — 규칙 미달일 때만 값을 주면 밑에 표시되고, null이면 사라진다 */
  notice?: string | null;
};

export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  hasError = false,
  notice = null,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={[
            // pr-12: 오른쪽 눈 버튼 자리(44px)와 겹치지 않게
            "h-11 w-full rounded-md border bg-surface pl-4 pr-12 text-body text-ink",
            "placeholder:text-sub/60",
            hasError ? "border-sub" : "border-line",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center
                     text-sub hover:text-ink"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {notice && (
        /* 원인이 된 칸 바로 밑에 붙인다 — 다른 섹션처럼 떨어져 보이면 안 된다 */
        <div className="-mt-0.5">
          <InlineAlert>{notice}</InlineAlert>
        </div>
      )}
    </div>
  );
}
