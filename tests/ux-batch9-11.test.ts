/**
 * 请求超时 signal 合并语义：
 * - 超时和调用方取消任一 abort 都要终止 fetch
 * - 不能覆盖/吃掉调用方的 signal，也不能让超时保护失效
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { withRequestTimeout } from "../lib/request-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withRequestTimeout", () => {
  it("超时后 abort（调用方没传 signal）", () => {
    vi.useFakeTimers();
    const { signal, cleanup } = withRequestTimeout(1000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it("调用方 abort 会触发合并 signal", () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const { signal, cleanup } = withRequestTimeout(60_000, external.signal);
    expect(signal.aborted).toBe(false);
    external.abort(new Error("user cancelled"));
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it("外部 signal 已经 aborted：合并 signal 直接就是 aborted", () => {
    vi.useFakeTimers();
    const external = new AbortController();
    external.abort();
    const { signal, cleanup } = withRequestTimeout(60_000, external.signal);
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it("cleanup 后计时器不再触发", () => {
    vi.useFakeTimers();
    const { signal, cleanup } = withRequestTimeout(1000);
    cleanup();
    vi.advanceTimersByTime(5000);
    expect(signal.aborted).toBe(false);
  });

  it("正常完成不触发 abort", () => {
    vi.useFakeTimers();
    const { signal, cleanup } = withRequestTimeout(1000);
    vi.advanceTimersByTime(500);
    cleanup();
    expect(signal.aborted).toBe(false);
  });
});
