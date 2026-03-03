import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildApp } from '../src/app';

type AppInstance = Awaited<ReturnType<typeof buildApp>>;

let app: AppInstance | null = null;

async function getApp(): Promise<AppInstance> {
    if (!app) {
        app = await buildApp();
        await app.ready();
    }
    return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const instance = await getApp();
    instance.server.emit('request', req, res);
}
