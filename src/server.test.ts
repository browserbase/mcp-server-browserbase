import { describe, expect, it, vi } from "vitest";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { registerServerCleanup, ServerList } from "./server.js";

function fakeServer(closeImpl?: () => Promise<void> | void): Server {
  return {
    close: vi.fn(closeImpl ?? (async () => undefined)),
  } as unknown as Server;
}

describe("ServerList lifecycle cleanup", () => {
  it("runs registered session cleanup before closing a server", async () => {
    const cleanup = vi.fn(async () => undefined);
    const server = fakeServer();
    registerServerCleanup(server, cleanup);

    const serverList = new ServerList(async () => server);
    const created = await serverList.create();

    await serverList.close(created);

    expect(cleanup).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
    expect(cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(server.close).mock.invocationCallOrder[0],
    );
  });

  it("keeps closeAll idempotent when a transport close re-enters ServerList.close", async () => {
    let created!: Server;
    const serverList = new ServerList(async () => {
      created = fakeServer(async () => {
        await serverList.close(created);
      });
      return created;
    });
    const cleanup = vi.fn(async () => undefined);

    const server = await serverList.create();
    registerServerCleanup(server, cleanup);

    await serverList.closeAll();
    await serverList.closeAll();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(server.close).toHaveBeenCalledOnce();
  });
});
