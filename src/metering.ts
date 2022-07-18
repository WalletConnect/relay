import { Logger } from "pino";
import { generateChildLogger } from "@walletconnect/logger";
import { HttpService } from "./http";

export class MeteringService {
  constructor(public server: HttpService, public logger: Logger) {
    this.server = server;
    this.logger = generateChildLogger(logger, "metering");
    this.initialize();
  }

  public validateProjectId(projectId: string): boolean {
    // TODO: integrate with Cerbrus for validation
    return true;
  }

  // ---------- Private ----------------------------------------------- //

  private initialize(): void {
    this.logger.trace(`Initialized`);
  }
}
