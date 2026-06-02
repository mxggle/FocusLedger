import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

describe("uiStore confirm", () => {
  beforeEach(() => {
    useUiStore.setState({ confirmRequest: null });
  });

  it("opens a confirm request and resolves true when confirmed", async () => {
    const promise = useUiStore.getState().confirm("Delete this?");

    const request = useUiStore.getState().confirmRequest;
    expect(request).not.toBeNull();
    expect(request?.message).toBe("Delete this?");

    useUiStore.getState().resolveConfirm(true);

    await expect(promise).resolves.toBe(true);
    expect(useUiStore.getState().confirmRequest).toBeNull();
  });

  it("resolves false when cancelled", async () => {
    const promise = useUiStore.getState().confirm({ message: "Drop?", danger: true });
    useUiStore.getState().resolveConfirm(false);

    await expect(promise).resolves.toBe(false);
    expect(useUiStore.getState().confirmRequest).toBeNull();
  });

  it("cancels an in-flight request when a new one replaces it", async () => {
    const first = useUiStore.getState().confirm("First");
    const second = useUiStore.getState().confirm("Second");

    await expect(first).resolves.toBe(false);
    expect(useUiStore.getState().confirmRequest?.message).toBe("Second");

    useUiStore.getState().resolveConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});
