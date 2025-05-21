import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Config } from "../config.js";

export let urlExtractedConfig: Partial<Config> | undefined;

export class ServerList {
  private _servers: Server[] = [];
  private _serverFactory: (config?: Partial<Config>) => Promise<Server>;

  constructor(serverFactory: (config?: Partial<Config>) => Promise<Server>) {
    this._serverFactory = serverFactory;
  }

  async create(urlConfig?: Partial<Config>) {
    const server = await this._serverFactory(urlConfig);
    this._servers.push(server);
    return server;
  }

  async close(server: Server) {
    const index = this._servers.indexOf(server);
    if (index !== -1)
      this._servers.splice(index, 1);
    await server.close();
  }

  async closeAll() {
    await Promise.all(this._servers.map(server => server.close()));
  }
}
