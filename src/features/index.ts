import type { Feature } from '../core/registry.ts'
import { ping } from './ping/index.ts'

/** bot に載せる feature の一覧。feature を追加したらここに登録する */
export const features: readonly Feature[] = [ping]
