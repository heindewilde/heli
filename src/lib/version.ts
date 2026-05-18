import { env } from '$env/dynamic/public';

export const VERSION = env.PUBLIC_HELI_VERSION || 'dev';
