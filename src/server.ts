import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  console.log(`Guardian Integration Gateway listening on port ${env.port}`);
});
