import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export class ServerList {
  private _servers: Server[] = [];
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
    await server.close();
    const index = this._servers.indexOf(server);
    if (index !== -1) this._servers.splice(index, 1);
  }

  async closeAll() {
    await Promise.all(this._servers.map((server) => server.close()));
  }
}
