import { createApp } from './app';
import type { Env } from './env';

export const app = createApp();

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
