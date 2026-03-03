import type { Handler } from '@netlify/functions';
import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from '../../src/app';

type Proxy = ReturnType<typeof awsLambdaFastify>;

let proxy: Proxy | null = null;

async function getProxy(): Promise<Proxy> {
    if (!proxy) {
        const app = await buildApp();
        await app.ready();
        proxy = awsLambdaFastify(app);
    }
    return proxy;
}

export const handler: Handler = async (event, context) => {
    // Ensure Fastify sees the original request path, not the rewritten function path
    if (event.rawUrl) {
        try {
            const url = new URL(event.rawUrl);
            event.path = url.pathname;
        } catch {
            // keep original event.path
        }
    }

    const p = await getProxy();
    return p(event, context);
};
