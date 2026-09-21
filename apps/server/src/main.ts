import { createServer } from './app';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

const { server } = createServer();
server.listen(PORT, HOST, () => {
  console.log(`Quizzer server listening on http://${HOST}:${PORT}`);
});
