import { watchlistGetHandler, watchlistPostHandler } from './handler'

export const runtime = 'edge'
export const GET = watchlistGetHandler
export const POST = watchlistPostHandler
