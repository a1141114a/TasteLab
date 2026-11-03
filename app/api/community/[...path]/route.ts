import {env} from 'cloudflare:workers';
import {handleCommunity} from '../../../../lib/community';
export const dynamic='force-dynamic';
export function GET(request:Request){return handleCommunity(request,env)}
export function POST(request:Request){return handleCommunity(request,env)}
