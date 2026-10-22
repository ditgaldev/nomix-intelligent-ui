import { createDemoService } from './service';

const server = createDemoService();
server.listen(5189, '127.0.0.1', () => console.log('Nomix 演示 API：http://127.0.0.1:5189（模拟数据，未调用模型）'));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
