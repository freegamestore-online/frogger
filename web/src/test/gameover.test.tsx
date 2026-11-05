import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Game } from "../components/Game";

afterEach(() => vi.restoreAllMocks());

describe("game over", () => {
  it("fires onGameOver once, reports 0 lives and stops the loop", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    let pending: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      pending = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const onGameOver = vi.fn();
    const onStats = vi.fn();
    render(<Game onScore={() => {}} onGameOver={onGameOver} onStats={onStats} />);

    // Idle on the start row: the 30s timer kills the hopper each life.
    for (let i = 0; i < 5000 && pending; i++) {
      const cb: FrameRequestCallback = pending;
      pending = null;
      now += 50;
      act(() => cb(now));
    }

    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(pending).toBeNull();
    expect(onStats.mock.lastCall?.[0].lives).toBe(0);
  });
});
