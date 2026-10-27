// @vitest-environment jsdom
// 스펙 interior-planner "CSV — 내려받기", AC-12(a)(태스크 5-2). jsdom에는 URL.createObjectURL·revokeObjectURL이 없어
// 스텁을 붙이고, 앵커 click은 가로채 내비게이션 경고를 막는다. Blob 내용은 `arrayBuffer()`로 바이트를 읽는다
// (`Blob.text()`는 맨 앞 BOM을 버려 BOM 삭제 변이가 살아남는다).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Q_CSV, Q_FILE_NAME } from "@/test/interiorPlanTableFixture";

import { downloadTextFile } from "./downloadTextFile";

const BLOB_URL = "blob:http://localhost/fake-csv";

type Clicked = { href: string; download: string; isInBody: boolean };

describe("downloadTextFile", () => {
  const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  let clicked: Clicked[];

  beforeEach(() => {
    createObjectURL = vi.fn<(blob: Blob) => string>(() => BLOB_URL);
    revokeObjectURL = vi.fn<(url: string) => void>();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({
        href: this.href,
        download: this.download,
        isInBody: document.body.contains(this),
      });
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const [name, descriptor] of [
      ["createObjectURL", originalCreate],
      ["revokeObjectURL", originalRevoke],
    ] as const) {
      if (descriptor === undefined) delete (URL as unknown as Record<string, unknown>)[name];
      else Object.defineProperty(URL, name, descriptor);
    }
  });

  const blobPassed = () => {
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    return createObjectURL.mock.calls[0][0];
  };

  it("Blob type text/csv;charset=utf-8, 바이트가 받은 문자열의 UTF-8 그대로(맨 앞 EF BB BF 하나)", async () => {
    downloadTextFile(Q_FILE_NAME, Q_CSV);
    const blob = blobPassed();
    expect(blob.type).toBe("text/csv;charset=utf-8");

    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    expect(bytes.slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.slice(3, 6)).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes).toEqual(Array.from(new TextEncoder().encode(Q_CSV)));
    // 끝은 CRLF
    expect(bytes.slice(-2)).toEqual([0x0d, 0x0a]);
  });

  it("임시 <a download='파일 이름' href=객체 URL>을 body에 붙여 한 번 누르고 뗀다", () => {
    const anchorsBefore = document.querySelectorAll("a").length;
    downloadTextFile(Q_FILE_NAME, Q_CSV);
    expect(clicked).toEqual([{ href: BLOB_URL, download: Q_FILE_NAME, isInBody: true }]);
    expect(document.querySelectorAll("a")).toHaveLength(anchorsBefore);
    vi.runAllTimers();
    expect(document.querySelectorAll("a")).toHaveLength(anchorsBefore);
  });

  it("revokeObjectURL은 바로 부르지 않고 40초 뒤 같은 URL로 한 번", () => {
    downloadTextFile(Q_FILE_NAME, Q_CSV);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(39_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("서버 요청을 보내지 않는다", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    downloadTextFile(Q_FILE_NAME, Q_CSV);
    vi.runAllTimers();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
