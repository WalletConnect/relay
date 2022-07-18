import config, { port, host } from "./config";
import { HttpService } from "./http";

const { app } = new HttpService(config);

app.listen({ port, host }, async (err, address) => {
  app.log.info(`Server listening on ${address}`);
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
