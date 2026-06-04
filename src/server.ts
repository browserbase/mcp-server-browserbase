import { Server } from "@modelcontextprotocol/sdk/server/index.js";

type ServerCleanup = () => Promise<void> | void;

const serverCleanups = new WeakMap<Server, ServerCleanup>();

export function registerServerCleanup(
  server: Server,
  cleanup: ServerCleanup,
) {
  serverCleanups.set(server, cleanup);
}

export class ServerList {
  private _servers: Server[] = [];
  private _closing = new WeakSet<Server>();
  private _serverFactory: () => Promise<Server>;

  constructor(serverFactory: () => Promise<Server>) {
    this._serverFactory = serverFactory;
  }

  async create() {
    const server = await this._serverFactory();
    this._servers.push(server);
    return server;
  }

  async close(server: Server) {
    if (this._closing.has(server)) return;

    const index = this._servers.indexOf(server);
    if (index === -1) return;

    this._closing.add(server);
    this._servers.splice(index, 1);

    try {
      await serverCleanups.get(server)?.();
    } finally {
      try {
        await server.close();
      } finally {
        this._closing.delete(server);
      }
    }
  }

  async closeAll() {
    await Promise.all([...this._servers].map((server) => this.close(server)));
  }
}
